"""
Chat Service
─────────────
Business logic layer that wraps the RAG pipeline:
  • Derives a confidence score from source hit scores
  • Translates confidence → action (mirrors API Gateway decision thresholds)
  • Produces ChatResponse / SSE generator
"""

import logging
from typing import Any, AsyncGenerator

from app.config.settings import settings
from app.models.schemas import ChatRequest, ChatResponse
from app.rag.pipeline import rag_pipeline

logger = logging.getLogger(__name__)


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

        confidence = self._estimate_confidence(result["sources"])
        action = self._decide_action(confidence)

        logger.info(
            "Chat response: ticket=%s, confidence=%.2f, action=%s",
            request.ticket_id,
            confidence,
            action,
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
        """
        Yields SSE-formatted lines: `data: <token>\n\n`
        Final sentinel: `data: [DONE]\n\n`
        """
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
        ctx = {
            "ticket_id": request.ticket_id,
            "org_id": request.org_id,
            "context_window": request.context_window,
            "priority": "MEDIUM",
            "category": "General",
        }
        ctx.update(request.ticket_context)
        return ctx

    def _estimate_confidence(self, sources: list[dict[str, Any]]) -> float:
        if not sources:
            return 0.5
        avg = sum(s["score"] for s in sources) / len(sources)
        return round(min(avg, 1.0), 4)

    def _decide_action(self, confidence: float) -> str:
        if confidence >= settings.confidence_auto_resolve:
            return "auto_resolve"
        if confidence >= settings.confidence_suggest:
            return "suggest"
        if confidence <= settings.confidence_escalate_max:
            return "escalate"
        return "none"


chat_service = ChatService()
