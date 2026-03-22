"""
Widget Session Service
───────────────────────
Main orchestrator for the public chatbot widget.  One call per inbound message.

Pipeline
────────
  1. Load session (messages + context) from Redis in a single pipeline call
  2. Detect intent, extract entities, evaluate escalation signals
  3. [Pre-agent escalation gate]
     If escalation fires:  create ticket → return escalated WidgetChatResponse
  4. Augment query with page context → pre-run RAG retrieval
     (result passed as AgentInput.rag_context so the agent skips its own retrieval)
  5. Run unified agent in CHAT mode
     – session_id used as ticket_id  (agent's ticket memory is bypassed via history=…)
     – history loaded from session memory (not from ticket_memory)
  6. Post-process: if agent returned action=escalate → create ticket
  7. Append user + assistant turns to session memory
  8. Build and return WidgetChatResponse

Key design decisions
────────────────────
• session_id as ticket_id — the agent only uses ticket_id for memory reads, which
  are bypassed by passing `history` directly.  No false ticket is created.
• rag_context pre-built here — allows page context to influence the retrieval
  query before the agent's own context-building step.
• Widget sessions have their own 30-min Redis store separate from ticket_memory
  (which has a 24 h TTL and a different key namespace).
• All escalation paths call widget/escalation.py which in turn calls
  action_gateway.create_ticket() and then clears the session.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.agent.schema import AgentInput, AgentMode
from app.conversation.conversation_state import conv_state_store
from app.conversation.entity_extractor import entity_extractor
from app.conversation.escalation_detector import escalation_detector
from app.conversation.intent_detector import intent_detector
from app.observability.traces import agent_tracer
from app.rag.prompt_builder import prompt_builder
from app.rag.reranker import reranker
from app.rag.retriever import retriever
from app.widget.escalation import escalate_widget_session
from app.widget.schemas import WidgetAction, WidgetChatRequest, WidgetChatResponse
from app.widget.session_memory import WidgetSessionMemory

logger = logging.getLogger(__name__)

# Page → retrieval query augmentation prefix
_PAGE_PREFIXES: Dict[str, str] = {
    "product":  "product features specifications pricing plans",
    "pricing":  "pricing plans tiers billing subscription cost",
    "docs":     "documentation guide how to setup integration",
    "general":  "",
}


class WidgetSessionService:
    """Stateless service — all state lives in the injected WidgetSessionMemory."""

    async def handle(
        self,
        request: WidgetChatRequest,
        session_memory: WidgetSessionMemory,
    ) -> WidgetChatResponse:
        from app.agent.agent import unified_agent

        turn_start = time.perf_counter()

        # ── 1. Load session ───────────────────────────────────────────────────
        messages, stored_ctx = await session_memory.get_session(request.session_id)

        # Merge stored context with fresh page context from this request
        # (page context may change as the user navigates)
        page_ctx: Dict[str, Any] = {
            "page":       request.context.page,
            "product_id": request.context.product_id,
            **request.context.metadata,
        }
        stored_ctx.update(page_ctx)

        # ── 2. Conversation intelligence ──────────────────────────────────────
        # Re-use the same components as chat_service for consistency.
        # Widget sessions use session_id as the "ticket_id" scoping key so the
        # conv_state Redis key is session-scoped, not ticket-scoped.
        state = await conv_state_store.get_or_create(
            request.org_id, request.session_id
        )
        intent_result  = await intent_detector.detect(request.org_id, request.message)
        entity_result  = entity_extractor.extract(request.message)
        escalation     = escalation_detector.detect(request.message, state, intent_result)

        logger.info(
            "Widget conv-intel: session=%s intent=%s stage=%s severity=%s escalate=%s",
            request.session_id,
            intent_result.intent.value,
            state.stage.value,
            escalation.severity.value,
            escalation.should_escalate,
        )

        # ── 3. Pre-agent escalation gate ──────────────────────────────────────
        if escalation.should_escalate:
            await conv_state_store.update(
                request.org_id, request.session_id,
                intent=intent_result.intent.value,
                entities=entity_result.entity_map,
                severity=escalation.severity.value,
                agent_action="escalate",
            )

            pre_trace = agent_tracer.build_pre_escalation(
                org_id=request.org_id,
                ticket_id=request.session_id,
                mode="widget",
                started_at=turn_start,
                conv_intent=intent_result.intent.value,
                conv_stage=state.stage.value,
                conv_severity=escalation.severity.value,
            )
            await agent_tracer.emit(pre_trace)

            ticket_id = await escalate_widget_session(
                org_id=request.org_id,
                session_id=request.session_id,
                messages=messages + [{"role": "user", "content": request.message}],
                page_context=page_ctx,
                intent=intent_result.intent.value,
                severity=escalation.severity.value,
                escalation_message=escalation.escalation_message,
                session_memory=session_memory,
            )

            reply = escalation.escalation_message or (
                "I'll connect you with a human support agent who can assist you "
                "further. A support ticket has been created and someone will be "
                "with you shortly."
            )
            return WidgetChatResponse(
                reply=reply,
                actions=[],
                confidence=0.0,
                escalated=True,
                ticket_id=ticket_id,
                session_id=request.session_id,
                trace_id=pre_trace.trace_id,
            )

        # ── 4. Page-context-aware RAG retrieval ───────────────────────────────
        rag_context_text = await self._build_rag_context(
            org_id=request.org_id,
            query=request.message,
            page=request.context.page,
            product_id=request.context.product_id,
        )

        # ── 5. Build agent input ──────────────────────────────────────────────
        ticket_context: Dict[str, Any] = {
            "ticket_id":           request.session_id,
            "org_id":              request.org_id,
            "priority":            "MEDIUM",
            "category":            "General",
            "context_window":      20,
            # Conversation intelligence
            "conv_intent":           intent_result.intent.value,
            "conv_intent_confidence": round(intent_result.confidence, 3),
            "conv_stage":            state.stage.value,
            "conv_severity":         escalation.severity.value,
            "conv_turn":             state.turn_count + 1,
            "conv_entities":         entity_result.entity_map,
            "conv_unresolved_turns": state.unresolved_turns,
            # Page context
            "page":                  request.context.page,
            "product_id":            request.context.product_id,
        }

        inp = AgentInput(
            mode=AgentMode.CHAT,
            org_id=request.org_id,
            ticket_id=request.session_id,   # session_id used as ticket_id
            query=request.message,
            ticket_context=ticket_context,
            rag_context=rag_context_text or None,  # None → agent runs its own retrieval
            history=messages,                       # pre-loaded → skips ticket_memory read
        )

        decision = await unified_agent.run(inp)

        # ── 6. Post-agent escalation ──────────────────────────────────────────
        escalated = False
        ticket_id: Optional[str] = None

        if decision.action.value == "escalate":
            escalated = True
            all_messages = messages + [
                {"role": "user",      "content": request.message},
                {"role": "assistant", "content": decision.message},
            ]
            ticket_id = await escalate_widget_session(
                org_id=request.org_id,
                session_id=request.session_id,
                messages=all_messages,
                page_context=page_ctx,
                intent=intent_result.intent.value,
                severity=escalation.severity.value,
                session_memory=session_memory,
            )

        # ── 7. Update state + persist session ─────────────────────────────────
        await conv_state_store.update(
            request.org_id, request.session_id,
            intent=intent_result.intent.value,
            entities=entity_result.entity_map,
            severity=escalation.severity.value,
            agent_action=decision.action.value,
        )

        if not escalated:
            # Only append to session if not escalated (session cleared on escalation)
            await session_memory.append_message(
                request.session_id, "user", request.message
            )
            await session_memory.append_message(
                request.session_id, "assistant", decision.message
            )
            await session_memory.save_context(request.session_id, stored_ctx)

        # ── 8. Emit trace ─────────────────────────────────────────────────────
        trace = agent_tracer.build(
            org_id=request.org_id,
            ticket_id=request.session_id,
            mode="widget",
            started_at=turn_start,
            decision_metadata=decision.metadata.get("metrics", {}),
            final_action=decision.action.value,
            final_confidence=decision.confidence,
            conv_intent=intent_result.intent.value,
            conv_stage=state.stage.value,
            conv_severity=escalation.severity.value,
            escalated_pre_agent=False,
            error=decision.metadata.get("error"),
        )
        await agent_tracer.emit(trace)

        # ── 9. Build response ─────────────────────────────────────────────────
        actions = self._build_actions(
            decision.action.value,
            request.context.page,
            decision.metadata,
        )

        return WidgetChatResponse(
            reply=decision.message,
            actions=actions,
            confidence=decision.confidence,
            escalated=escalated,
            ticket_id=ticket_id,
            session_id=request.session_id,
            trace_id=trace.trace_id,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _build_rag_context(
        self,
        org_id: str,
        query: str,
        page: str,
        product_id: Optional[str],
    ) -> str:
        """
        Run page-context-aware retrieval and return a formatted context block.

        The query is augmented with page-specific terms so that, for example,
        a generic "how much does it cost?" asked on the pricing page retrieves
        pricing docs rather than generic FAQ entries.
        """
        page_prefix = _PAGE_PREFIXES.get(page, "")
        augmented_query = f"{page_prefix} {query}".strip() if page_prefix else query

        filter_conditions: Dict[str, Any] = {}
        if product_id:
            filter_conditions["product_id"] = product_id

        try:
            docs = await retriever.retrieve(
                org_id=org_id,
                query=augmented_query,
                filter_conditions=filter_conditions or None,
            )
            reranked = await reranker.rerank(augmented_query, docs)
            return prompt_builder.build_rag_context(reranked)
        except Exception as exc:
            logger.warning("Widget RAG retrieval failed (non-fatal): %s", exc)
            return ""

    @staticmethod
    def _build_actions(
        agent_action: str,
        page: str,
        metadata: Dict[str, Any],
    ) -> List[WidgetAction]:
        """
        Convert the agent action + page context into widget UI action buttons.
        The frontend renders these as clickable chips below the reply bubble.
        """
        actions: List[WidgetAction] = []

        if agent_action == "suggest" and page == "pricing":
            actions.append(WidgetAction(
                type="view_pricing",
                label="View pricing plans",
                url="/pricing",
            ))
        elif agent_action == "suggest" and page == "docs":
            actions.append(WidgetAction(
                type="open_docs",
                label="Open documentation",
                url="/docs",
            ))
        elif agent_action == "escalate":
            actions.append(WidgetAction(
                type="contact_form",
                label="Contact support",
                url="/support",
            ))

        return actions


# Module-level singleton
widget_session_service = WidgetSessionService()
