"""
RAG Pipeline  (production-hardened)
─────────────────────────────────────
Full pipeline for one conversation turn:

  [INPUT GUARD]  sanitize_input()         ← blocks injection attempts
  [RETRIEVE]     hybrid retriever          ← dense + keyword, RRF merge
  [RE-RANK]      LLM re-ranker            ← filters noise from top-K
  [MEMORY]       load conversation window ← Redis, with summarization
  [PROMPT]       build RAG message list   ← RAG context + history
  [LLM]          generate via API Gateway ← retry + timeout
  [OUTPUT GUARD] validate_output()        ← prevents leakage
  [PERSIST]      write to memory          ← with auto-summarization
  [METRICS]      emit timing + counters   ← structured log
"""

import logging
from typing import Any, AsyncGenerator

from app.config.settings import settings
from app.llm.gateway_client import gateway_client
from app.memory.summarizer import summarizer
from app.memory.ticket_memory import ticket_memory
from app.observability.metrics import MetricsCollector
from app.rag.prompt_builder import prompt_builder
from app.rag.reranker import reranker
from app.rag.retriever import retriever
from app.security.guardrails import guardrails

logger = logging.getLogger(__name__)

_INJECTION_RESPONSE = (
    "I'm sorry, but I can't process that request. "
    "Please rephrase your question and try again."
)


class RAGPipeline:
    # ── Standard request/response ─────────────────────────────────────────

    async def run(
        self,
        org_id: str,
        ticket_id: str,
        user_message: str,
        ticket_context: dict[str, Any],
        mode: str = "support",
    ) -> dict[str, Any]:
        m = MetricsCollector()

        # ── 1. Input guard ────────────────────────────────────────────────
        guard = guardrails.check_input(user_message, org_id)
        if not guard.safe:
            logger.warning(
                "Input blocked: org=%s, ticket=%s, reason=%s",
                org_id, ticket_id, guard.reason,
            )
            m.increment("guard_block")
            m.emit(org_id=org_id, ticket_id=ticket_id, blocked=True, reason=guard.reason)
            return {
                "response": guard.safe_value or _INJECTION_RESPONSE,
                "sources": [],
                "usage": {},
                "blocked": True,
            }

        clean_message = guard.safe_value

        # ── 2. Hybrid retrieval ───────────────────────────────────────────
        m.start("retrieval")
        retrieved_docs = await retriever.retrieve(
            org_id=org_id,
            query=clean_message,
            top_k=settings.top_k_retrieval * 2,  # fetch extra for re-ranker
        )
        m.stop("retrieval")
        m.record("retrieved_count", len(retrieved_docs))

        # ── 3. Re-rank ────────────────────────────────────────────────────
        m.start("rerank")
        reranked_docs = await reranker.rerank(
            org_id=org_id,
            query=clean_message,
            docs=retrieved_docs,
            top_n=settings.top_k_retrieval,
        )
        m.stop("rerank")
        m.record("reranked_count", len(reranked_docs))

        # ── 4. Memory ─────────────────────────────────────────────────────
        m.start("memory_read")
        history = await ticket_memory.get_recent_messages(
            org_id=org_id,
            ticket_id=ticket_id,
            limit=ticket_context.get("context_window", 10),
        )
        m.stop("memory_read")

        # ── 5. Build prompt ───────────────────────────────────────────────
        rag_context = prompt_builder.build_rag_context(reranked_docs)
        messages = prompt_builder.build_messages(history, clean_message, rag_context)
        system_prompt = prompt_builder.build_system_prompt(ticket_context, mode)

        # ── 6. LLM call ───────────────────────────────────────────────────
        m.start("llm")
        result = await gateway_client.generate(
            org_id=org_id,
            messages=messages,
            system_prompt=system_prompt,
        )
        m.stop("llm")

        usage = result.get("usage", {})
        m.record("tokens_used", usage.get("tokensUsed", 0))

        raw_response: str = result.get("content", "")

        # ── 7. Output guard ───────────────────────────────────────────────
        out_guard = guardrails.check_output(raw_response, org_id)
        response_text = out_guard.safe_value  # safe_value = original if clean

        if not out_guard.safe:
            m.increment("output_violation")

        # ── 8. Persist to memory ──────────────────────────────────────────
        m.start("memory_write")
        await ticket_memory.add_message(org_id, ticket_id, "user", clean_message)
        await ticket_memory.add_message(org_id, ticket_id, "assistant", response_text)
        m.stop("memory_write")

        # Auto-summarize if conversation is getting long (non-blocking)
        try:
            summarized = await summarizer.maybe_summarize(org_id, ticket_id)
            if summarized:
                m.increment("summarization_triggered")
        except Exception as exc:
            logger.warning("Summarization failed (non-fatal): %s", exc)

        # ── 9. Build source citations ─────────────────────────────────────
        sources = [
            {
                "id": doc["id"],
                "score": doc.get("rerank_score", doc["score"]),
                "source": doc["payload"].get("source", ""),
                "excerpt": doc["payload"].get("text", "")[:200],
            }
            for doc in reranked_docs
            if doc.get("rerank_score", doc["score"]) >= settings.min_retrieval_score
        ]

        # ── 10. Emit metrics ──────────────────────────────────────────────
        m.emit(org_id=org_id, ticket_id=ticket_id, source_count=len(sources))

        return {
            "response": response_text,
            "sources": sources,
            "usage": usage,
            "reranked_docs": reranked_docs,  # passed to chat_service for confidence
        }

    # ── Streaming ─────────────────────────────────────────────────────────

    async def stream(
        self,
        org_id: str,
        ticket_id: str,
        user_message: str,
        ticket_context: dict[str, Any],
        mode: str = "support",
    ) -> AsyncGenerator[str, None]:
        """
        Streaming pipeline.  Guards + retrieval + re-ranking run upfront
        (blocking), then tokens are streamed.  Memory is persisted after the
        stream closes.
        """
        # Guard
        guard = guardrails.check_input(user_message, org_id)
        if not guard.safe:
            yield f"data: {guard.safe_value or _INJECTION_RESPONSE}\n\n"
            yield "data: [DONE]\n\n"
            return

        clean_message = guard.safe_value

        # Retrieval + re-rank (same as run())
        retrieved_docs = await retriever.retrieve(org_id=org_id, query=clean_message)
        reranked_docs = await reranker.rerank(
            org_id=org_id, query=clean_message, docs=retrieved_docs,
            top_n=settings.top_k_retrieval,
        )
        history = await ticket_memory.get_recent_messages(
            org_id, ticket_id, limit=ticket_context.get("context_window", 10)
        )
        rag_context = prompt_builder.build_rag_context(reranked_docs)
        messages = prompt_builder.build_messages(history, clean_message, rag_context)
        system_prompt = prompt_builder.build_system_prompt(ticket_context, mode)

        # Stream tokens
        full_parts: list[str] = []
        async for token in gateway_client.stream_generate(
            org_id=org_id, messages=messages, system_prompt=system_prompt
        ):
            full_parts.append(token)
            yield token

        # Persist + output guard on the complete response
        full_response = "".join(full_parts)
        out_guard = guardrails.check_output(full_response, org_id)
        safe_response = out_guard.safe_value

        await ticket_memory.add_message(org_id, ticket_id, "user", clean_message)
        await ticket_memory.add_message(org_id, ticket_id, "assistant", safe_response)

        try:
            await summarizer.maybe_summarize(org_id, ticket_id)
        except Exception as exc:
            logger.warning("Post-stream summarization failed: %s", exc)


rag_pipeline = RAGPipeline()
