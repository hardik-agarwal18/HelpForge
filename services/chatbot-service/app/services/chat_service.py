"""
Chat Service  (unified agent integration)
──────────────────────────────────────────
Wraps the unified agent for CHAT mode and translates AgentDecision back into
the ChatResponse shape that the public chat endpoint expects.

Agent flow (replaces direct RAG pipeline call):
  1. Build AgentInput from ChatRequest
  2. Call unified_agent.run(inp) → AgentDecision
     (agent handles RAG retrieval, memory, LLM decision, tool execution)
  3. Map AgentDecision → ChatResponse (action mapping below)
  4. Write memory for streaming (agent handles it for non-streaming)

Action mapping (AgentDecision → ChatResponse.action):
  respond    → "none"         (answered; no ticket-level action needed)
  tool_call  → "none"         (tool was already executed by agent)
  escalate   → "escalate"
  suggest    → "suggest"

Confidence is taken directly from AgentDecision.confidence — which is now
set by the LLM itself (0–1 range) rather than computed from heuristics.
The old threshold constants are preserved in settings for the automation
service which still uses the legacy flow.
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
    # ── Standard request/response (agent-powered) ─────────────────────────

    async def handle_message(self, request: ChatRequest) -> ChatResponse:
        """
        Route through the unified agent in CHAT mode.

        The agent handles: input guard → RAG → memory → LLM decision →
        optional tool execution → output guard → metrics.
        """
        from app.agent.agent import unified_agent
        from app.agent.schema import AgentInput, AgentMode

        ticket_context = self._build_ticket_context(request)

        inp = AgentInput(
            mode=AgentMode.CHAT,
            org_id=request.org_id,
            ticket_id=request.ticket_id,
            user_id=request.user_id,
            query=request.message,
            ticket_context=ticket_context,
        )

        decision = await unified_agent.run(inp)

        # Map AgentAction → ChatResponse.action
        action = self._map_action(decision.action.value)

        logger.info(
            "Chat (agent): ticket=%s confidence=%.3f action=%s tool=%s",
            request.ticket_id, decision.confidence, action, decision.tool,
        )

        # Sources come from agent metadata if the agent ran retrieval
        sources = decision.metadata.get("sources", [])

        return ChatResponse(
            ticket_id=request.ticket_id,
            message=decision.message,
            confidence=decision.confidence,
            action=action,
            sources=sources,
            metadata={
                "usage": decision.metadata.get("metrics", {}),
                "reasoning": decision.reasoning,
                "tool": decision.tool,
                "tool_result": decision.tool_result,
            },
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

    @staticmethod
    def _map_action(agent_action: str) -> str:
        """
        Translate AgentAction values to the ChatResponse action vocabulary.

        ChatResponse callers (API Gateway) understand:
          auto_resolve | suggest | escalate | none
        """
        return {
            "respond": "none",
            "tool_call": "none",   # tool was already executed by the agent
            "escalate": "escalate",
            "suggest": "suggest",
        }.get(agent_action, "none")

    def _decide_action(self, confidence: float) -> str:
        """Legacy threshold-based decision — kept for reference and fallback."""
        if confidence >= settings.confidence_auto_resolve:
            return "auto_resolve"
        if confidence >= settings.confidence_suggest:
            return "suggest"
        if confidence <= settings.confidence_escalate_max:
            return "escalate"
        return "none"


chat_service = ChatService()
