"""
Chat Service  (multi-signal confidence)
────────────────────────────────────────
Wraps the RAG pipeline and makes the action decision that gets sent back
to the API Gateway (auto_resolve / suggest / escalate / none).

Confidence is now a weighted combination of three independent signals:

  Signal 1 — Retrieval quality  (40%)
    Average Qdrant similarity score of returned sources.
    If re-ranker scores are present, they carry 40% weight within this signal
    (they are a stronger quality indicator than raw vector distance).

  Signal 2 — Answer completeness  (30%)
    Proxy for how thorough the response is.  Very short responses are likely
    "I don't know" answers; very long ones may be rambling.

  Signal 3 — Certainty  (30%)
    Inverse of uncertainty hedge-phrase density.
    Each detected phrase ("I'm not sure", "might be", etc.) reduces this
    signal by 15 pp, floored at 0.

Final confidence = 0.40 × sig1 + 0.30 × sig2 + 0.30 × sig3
Clamped to [0.0, 1.0].
"""

import logging
from typing import Any, AsyncGenerator

from app.config.settings import settings
from app.models.schemas import ChatRequest, ChatResponse
from app.rag.pipeline import rag_pipeline

logger = logging.getLogger(__name__)

# Phrases that indicate the LLM itself is uncertain
_UNCERTAINTY_PHRASES: list[str] = [
    "i'm not sure",
    "i don't know",
    "i cannot be certain",
    "i am not certain",
    "unclear",
    "uncertain",
    "might be",
    "could be",
    "possibly",
    "i think",
    "maybe",
    "not certain",
    "i cannot confirm",
    "i can't confirm",
    "i cannot guarantee",
    "i'm unsure",
]


class ChatService:
    # ── Standard request/response ─────────────────────────────────────────

    async def handle_message(self, request: ChatRequest) -> ChatResponse:
        ticket_context = self._build_ticket_context(request)

        result = await rag_pipeline.run(
            org_id=request.org_id,
            ticket_id=request.ticket_id,
            user_message=request.message,
            ticket_context=ticket_context,
            mode=request.mode,
        )

        # Pipeline blocked the request (injection / empty)
        if result.get("blocked"):
            return ChatResponse(
                ticket_id=request.ticket_id,
                message=result["response"],
                confidence=0.0,
                action="none",
                sources=[],
            )

        confidence = self._calculate_confidence(
            sources=result["sources"],
            reranked_docs=result.get("reranked_docs", []),
            response=result["response"],
        )
        action = self._decide_action(confidence)

        logger.info(
            "Chat: ticket=%s, confidence=%.3f, action=%s, sources=%d",
            request.ticket_id, confidence, action, len(result["sources"]),
        )

        return ChatResponse(
            ticket_id=request.ticket_id,
            message=result["response"],
            confidence=confidence,
            action=action,
            sources=result["sources"],
            metadata={"usage": result.get("usage", {})},
        )

    # ── SSE streaming ─────────────────────────────────────────────────────

    async def stream_message(
        self, request: ChatRequest
    ) -> AsyncGenerator[str, None]:
        ticket_context = self._build_ticket_context(request)
        async for token in rag_pipeline.stream(
            org_id=request.org_id,
            ticket_id=request.ticket_id,
            user_message=request.message,
            ticket_context=ticket_context,
            mode=request.mode,
        ):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    # ── Private helpers ───────────────────────────────────────────────────

    def _build_ticket_context(self, request: ChatRequest) -> dict[str, Any]:
        ctx: dict[str, Any] = {
            "ticket_id": request.ticket_id,
            "org_id": request.org_id,
            "context_window": request.context_window,
            "priority": "MEDIUM",
            "category": "General",
        }
        ctx.update(request.ticket_context)
        return ctx

    def _calculate_confidence(
        self,
        sources: list[dict[str, Any]],
        reranked_docs: list[dict[str, Any]],
        response: str,
    ) -> float:
        # ── Signal 1: Retrieval quality (40%) ─────────────────────────────
        if reranked_docs:
            raw_scores = [d["score"] for d in reranked_docs]
            rerank_scores = [d["rerank_score"] for d in reranked_docs if "rerank_score" in d]

            avg_raw = sum(raw_scores) / len(raw_scores)
            if rerank_scores:
                avg_rerank = sum(rerank_scores) / len(rerank_scores)
                retrieval_signal = 0.60 * avg_raw + 0.40 * avg_rerank
            else:
                retrieval_signal = avg_raw
        else:
            retrieval_signal = 0.25  # No sources → low confidence

        # ── Signal 2: Answer completeness (30%) ───────────────────────────
        resp_len = len(response.strip())
        if resp_len < 40:
            completeness = 0.15   # Near-empty or refusal
        elif resp_len < 120:
            completeness = 0.50   # Short answer
        elif resp_len < 600:
            completeness = 1.00   # Ideal range
        else:
            completeness = 0.80   # Very long → may be rambling

        # ── Signal 3: Certainty (30%) — inverse of uncertainty ─────────────
        lower_response = response.lower()
        uncertainty_hits = sum(
            1 for phrase in _UNCERTAINTY_PHRASES if phrase in lower_response
        )
        certainty_signal = max(0.0, 1.0 - uncertainty_hits * 0.15)

        # ── Weighted combination ───────────────────────────────────────────
        confidence = (
            0.40 * retrieval_signal
            + 0.30 * completeness
            + 0.30 * certainty_signal
        )

        return round(min(1.0, max(0.0, confidence)), 4)

    def _decide_action(self, confidence: float) -> str:
        if confidence >= settings.confidence_auto_resolve:
            return "auto_resolve"
        if confidence >= settings.confidence_suggest:
            return "suggest"
        if confidence <= settings.confidence_escalate_max:
            return "escalate"
        return "none"


chat_service = ChatService()
