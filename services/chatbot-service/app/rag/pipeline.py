"""
RAG Pipeline
─────────────
Orchestrates the full retrieval-augmented generation loop for one turn:

  User message
    → retrieve relevant chunks (Qdrant, org-isolated)
    → load conversation history (Redis)
    → build RAG-augmented message list
    → call LLM via API Gateway (with retry / timeout)
    → persist user + assistant messages to memory
    → return response + source citations
"""

import logging
from typing import Any, AsyncGenerator

from app.config.settings import settings
from app.llm.gateway_client import gateway_client
from app.memory.ticket_memory import ticket_memory
from app.rag.prompt_builder import prompt_builder
from app.rag.retriever import retriever

logger = logging.getLogger(__name__)


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
        """
        Execute the RAG pipeline and return a complete response dict:
          { response: str, sources: list, usage: dict }
        """
        # 1. Retrieve relevant docs (org-isolated)
        retrieved_docs = await retriever.retrieve(
            org_id=org_id,
            query=user_message,
            top_k=settings.top_k_retrieval,
        )

        # 2. Load conversation window
        history = await ticket_memory.get_recent_messages(
            org_id=org_id,
            ticket_id=ticket_id,
            limit=ticket_context.get("context_window", 10),
        )

        # 3. Build RAG context block
        rag_context = prompt_builder.build_rag_context(retrieved_docs)

        # 4. Assemble message list for LLM
        messages = prompt_builder.build_messages(history, user_message, rag_context)

        # 5. Build system prompt (mode-aware)
        system_prompt = prompt_builder.build_system_prompt(ticket_context, mode)

        # 6. Call LLM via API Gateway (retry + timeout handled inside client)
        result = await gateway_client.generate(
            org_id=org_id,
            messages=messages,
            system_prompt=system_prompt,
        )
        response_text: str = result.get("content", "")

        # 7. Persist turn to memory
        await ticket_memory.add_message(org_id, ticket_id, "user", user_message)
        await ticket_memory.add_message(org_id, ticket_id, "assistant", response_text)

        # 8. Build source citations (only high-confidence hits)
        sources = [
            {
                "id": doc["id"],
                "score": doc["score"],
                "source": doc["payload"].get("source", ""),
                "excerpt": doc["payload"].get("text", "")[:200],
            }
            for doc in retrieved_docs
            if doc["score"] >= settings.min_retrieval_score
        ]

        return {
            "response": response_text,
            "sources": sources,
            "usage": result.get("usage", {}),
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
        Same pipeline as run() but streams tokens from the LLM.
        After streaming completes the full response is persisted to memory.
        """
        retrieved_docs = await retriever.retrieve(org_id=org_id, query=user_message)
        history = await ticket_memory.get_recent_messages(
            org_id, ticket_id, limit=ticket_context.get("context_window", 10)
        )
        rag_context = prompt_builder.build_rag_context(retrieved_docs)
        messages = prompt_builder.build_messages(history, user_message, rag_context)
        system_prompt = prompt_builder.build_system_prompt(ticket_context, mode)

        full_response_parts: list[str] = []

        async for token in gateway_client.stream_generate(
            org_id=org_id, messages=messages, system_prompt=system_prompt
        ):
            full_response_parts.append(token)
            yield token

        # Persist the complete response after the stream closes
        full_response = "".join(full_response_parts)
        await ticket_memory.add_message(org_id, ticket_id, "user", user_message)
        await ticket_memory.add_message(org_id, ticket_id, "assistant", full_response)


rag_pipeline = RAGPipeline()
