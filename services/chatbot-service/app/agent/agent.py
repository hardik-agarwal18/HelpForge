"""
Unified Agent — Main Decision Engine
──────────────────────────────────────
Central AI decision engine powering all three operational modes:

  CHAT       — customer-facing conversation turns
  AUTOMATION — event-driven ticket processing (BullMQ → bridge → here)
  AUGMENTATION — human-agent assist suggestions

Execution flow for every call:
  1.  Input guard          — blocks injection attempts on the query
  2.  Context build        — RAG retrieval + memory load (or use pre-provided)
  3.  Mode dispatch        — select prompt template + message builder
  4.  LLM decision call    — first call → structured JSON decision
  5.  Decision validation  — schema + semantic checks (rejects DISABLED tool calls)
  6.  Reasoning loop       — up to MAX_AGENT_STEPS total LLM calls:
                               tool_call → execute → full LLM re-decision → repeat
                             Each iteration is a real reasoning step, not just
                             "format the result" — the LLM can chain tools,
                             retry with a different tool, or escalate on failure.
  7.  Output guard         — scan final message for leakage
  8.  Metrics              — structured log with timing + counters
  9.  Return AgentDecision — fully typed, serialisable result

Loop termination:
  • decision.action != TOOL_CALL → exits naturally
  • agent_step >= MAX_AGENT_STEPS → forced ESCALATE (safety ceiling)
  • executor.MAX_TOOL_CALLS_PER_RUN → tool skipped, agent responds/escalates

Tool availability:
  The executor exposes available_tool_descriptions() which tags each tool as
  ✓ ACTIVE / ⚠ DEGRADED / ✗ DISABLED so the LLM never picks a broken tool.
  The validator also rejects DISABLED tool calls before execution.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Union

import time

from app.agent.executor import tool_executor
from app.agent.modes.augmentation_mode import AugmentationMode
from app.agent.modes.automation_mode import AutomationMode
from app.agent.modes.chat_mode import ChatMode
from app.agent.schema import (
    AgentAction,
    AgentContext,
    AgentDecision,
    AgentInput,
    AgentMode,
    DryRunStep,
    DryRunTrace,
)
from app.agent.utils import build_fallback_decision_dict, extract_json
from app.agent.validator import ValidationError, agent_validator
from app.config.settings import settings
from app.llm.gateway_client import gateway_client
from app.memory.ticket_memory import ticket_memory
from app.observability.metrics import MetricsCollector
from app.rag.prompt_builder import prompt_builder
from app.rag.reranker import reranker
from app.rag.retriever import retriever
from app.security.guardrails import guardrails

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Total LLM decision steps allowed per agent run (initial call + all followups).
# Each tool_call iteration consumes one step.  Exceeding this forces ESCALATE.
# Relationship to executor limit: MAX_AGENT_STEPS governs LLM calls;
# executor.MAX_TOOL_CALLS_PER_RUN governs tool executions — both must pass.
MAX_AGENT_STEPS = 5

MEMORY_WINDOW = 10        # Recent messages loaded from Redis


class UnifiedAgent:
    """
    Single entry point for all three agent modes.

    Thread-safe: no mutable state — all state lives in the MetricsCollector
    and AgentContext objects created per-call.
    """

    def __init__(self) -> None:
        self._modes = {
            AgentMode.CHAT: ChatMode(),
            AgentMode.AUTOMATION: AutomationMode(),
            AgentMode.AUGMENTATION: AugmentationMode(),
        }

    # ── Public API ────────────────────────────────────────────────────────

    async def run(self, inp: AgentInput) -> AgentDecision:
        """
        Execute one full agent turn and return a structured decision.
        Never raises — all errors produce an ESCALATE fallback decision.
        """
        m = MetricsCollector()
        tool_executor.reset_call_count()

        try:
            return await self._run_inner(inp, m)
        except Exception as exc:
            logger.exception(
                "Unhandled error in agent run: org=%s ticket=%s mode=%s err=%s",
                inp.org_id, inp.ticket_id, inp.mode, exc,
            )
            fallback = build_fallback_decision_dict(
                inp.mode.value, f"Unhandled exception: {type(exc).__name__}"
            )
            decision = AgentDecision(**fallback)
            decision.metadata["error"] = str(exc)
            m.emit(
                org_id=inp.org_id,
                ticket_id=inp.ticket_id,
                mode=inp.mode.value,
                action="escalate",
                confidence=0.0,
                error=True,
            )
            return decision

    # ── Inner pipeline ────────────────────────────────────────────────────

    async def _run_inner(
        self, inp: AgentInput, m: MetricsCollector
    ) -> AgentDecision:
        is_dry_run = inp.dry_run
        trace_steps: list[DryRunStep] = []  # populated only when dry_run=True
        run_start = time.perf_counter()

        # ── 1. Input guard ────────────────────────────────────────────────
        m.start("guard_input")
        guard = guardrails.check_input(inp.query, inp.org_id)
        m.stop("guard_input")

        if not guard.safe:
            logger.warning(
                "Input blocked: org=%s ticket=%s reason=%s",
                inp.org_id, inp.ticket_id, guard.reason,
            )
            m.increment("guard_block")
            fallback = build_fallback_decision_dict(
                inp.mode.value, f"Input blocked: {guard.reason}"
            )
            decision = AgentDecision(
                **{**fallback, "message": guard.safe_value or fallback["message"]}
            )
            if is_dry_run:
                trace_steps.append(DryRunStep(
                    step=0, step_type="guard_block",
                    detail=f"Input blocked: {guard.reason}",
                ))
                decision.metadata["dry_run_trace"] = self._build_trace(
                    inp, trace_steps, decision
                ).model_dump()
            self._emit_metrics(m, inp, decision, tool_calls=0, agent_steps=0)
            return decision

        clean_query = guard.safe_value

        # ── 2. Build context (RAG + memory) ───────────────────────────────
        m.start("context_build")
        ctx = await self._build_context(inp, clean_query, m)
        m.stop("context_build")

        # ── 3. Dispatch to mode handler ───────────────────────────────────
        mode_handler = self._modes[inp.mode]
        # available_tool_descriptions() injects ACTIVE/DISABLED/DEGRADED + cost
        # so the LLM makes informed, cost-aware decisions.
        tool_descs = tool_executor.available_tool_descriptions()

        # ── 4. First LLM call — decision ──────────────────────────────────
        t0 = time.perf_counter()
        m.start("llm_step_0")
        messages, system_prompt = mode_handler.build_messages(inp, ctx, tool_descs)
        raw_result = await gateway_client.generate(
            org_id=inp.org_id,
            messages=messages,
            system_prompt=system_prompt,
        )
        m.stop("llm_step_0")
        step0_ms = (time.perf_counter() - t0) * 1000
        m.record("llm_tokens", raw_result.get("usage", {}).get("tokensUsed", 0))

        # ── 5. Parse + validate decision ──────────────────────────────────
        decision = self._parse_and_validate(raw_result.get("content", ""), inp.mode)

        if is_dry_run:
            trace_steps.append(DryRunStep(
                step=0, step_type="llm_decision",
                action=decision.action.value,
                confidence=decision.confidence,
                reasoning=decision.reasoning,
                message=decision.message,
                tool=decision.tool,
                tool_input=decision.tool_input or None,
                latency_ms=round(step0_ms, 2),
            ))

        # ── 6. Reasoning loop ─────────────────────────────────────────────
        agent_step = 0
        tool_calls = 0

        while decision.action == AgentAction.TOOL_CALL and decision.tool:
            if agent_step >= MAX_AGENT_STEPS:
                logger.warning(
                    "MAX_AGENT_STEPS (%d) reached: org=%s ticket=%s — forcing escalate",
                    MAX_AGENT_STEPS, inp.org_id, inp.ticket_id,
                )
                m.increment("step_limit_hit")
                if is_dry_run:
                    trace_steps.append(DryRunStep(
                        step=agent_step + 1, step_type="step_limit",
                        detail=f"MAX_AGENT_STEPS ({MAX_AGENT_STEPS}) reached — escalating",
                    ))
                decision = AgentDecision(
                    **build_fallback_decision_dict(
                        inp.mode.value,
                        f"Max agent steps ({MAX_AGENT_STEPS}) reached without resolution",
                    )
                )
                break

            tool_name = decision.tool
            tool_input = decision.tool_input
            tool_cost = getattr(
                tool_executor._registry.get(tool_name), "cost", None
            )
            tool_cost_str = tool_cost.value if tool_cost else "UNKNOWN"

            # ── Execute (real) or Simulate (dry run) ──────────────────────
            t_tool = time.perf_counter()
            m.start(f"tool_{tool_name}_{agent_step}")

            if is_dry_run:
                tool_result = tool_executor.simulate(tool_name, tool_input)
                logger.info(
                    "DRY RUN — simulated tool: org=%s ticket=%s tool=%s cost=%s",
                    inp.org_id, inp.ticket_id, tool_name, tool_cost_str,
                )
            else:
                tool_result = await tool_executor.execute(tool_name, tool_input)
                logger.info(
                    "Agent step %d: org=%s ticket=%s tool=%s success=%s cost=%s",
                    agent_step + 1, inp.org_id, inp.ticket_id,
                    tool_name, tool_result.get("success"), tool_cost_str,
                )

            m.stop(f"tool_{tool_name}_{agent_step}")
            tool_ms = (time.perf_counter() - t_tool) * 1000
            m.increment("tool_calls")
            tool_calls += 1
            agent_step += 1

            decision.tool_result = tool_result

            if is_dry_run:
                trace_steps.append(DryRunStep(
                    step=agent_step, step_type="tool_simulated",
                    tool=tool_name,
                    tool_input=tool_input,
                    tool_cost=tool_cost_str,
                    simulated_result=tool_result,
                    latency_ms=round(tool_ms, 2),
                ))

            # Full LLM re-decision
            enriched_result = {**tool_result, "_step": agent_step}
            t_llm = time.perf_counter()
            m.start(f"llm_step_{agent_step}")
            followup_messages, _ = mode_handler.build_followup_messages(
                inp, ctx, decision, enriched_result, tool_descs
            )
            followup_raw = await gateway_client.generate(
                org_id=inp.org_id,
                messages=followup_messages,
                system_prompt=system_prompt,
            )
            m.stop(f"llm_step_{agent_step}")
            llm_ms = (time.perf_counter() - t_llm) * 1000
            m.record(
                f"llm_tokens_step_{agent_step}",
                followup_raw.get("usage", {}).get("tokensUsed", 0),
            )

            prev_tool_result = tool_result
            decision = self._parse_and_validate(
                followup_raw.get("content", ""), inp.mode
            )
            if decision.tool_result is None:
                decision.tool_result = prev_tool_result

            if is_dry_run:
                trace_steps.append(DryRunStep(
                    step=agent_step, step_type="llm_followup",
                    action=decision.action.value,
                    confidence=decision.confidence,
                    reasoning=decision.reasoning,
                    message=decision.message,
                    tool=decision.tool,
                    tool_input=decision.tool_input or None,
                    latency_ms=round(llm_ms, 2),
                ))

        # ── 7. Output guard ───────────────────────────────────────────────
        m.start("guard_output")
        out_guard = guardrails.check_output(decision.message, inp.org_id)
        m.stop("guard_output")

        if not out_guard.safe:
            m.increment("output_violation")
        decision.message = out_guard.safe_value

        # ── 8. Emit metrics ───────────────────────────────────────────────
        metrics = self._emit_metrics(m, inp, decision, tool_calls, agent_step)
        decision.metadata["metrics"] = metrics

        # ── 9. Attach dry run trace ───────────────────────────────────────
        if is_dry_run:
            total_ms = (time.perf_counter() - run_start) * 1000
            trace = self._build_trace(inp, trace_steps, decision)
            trace.total_latency_ms = round(total_ms, 2)
            trace.total_llm_calls = agent_step + 1  # initial + followups
            trace.total_tool_calls = tool_calls
            trace.simulated_tools = [
                s.tool for s in trace_steps
                if s.step_type == "tool_simulated" and s.tool
            ]
            decision.metadata["dry_run_trace"] = trace.model_dump()
            logger.info(
                "DRY RUN complete: org=%s ticket=%s steps=%d tools=%d latency=%.0fms",
                inp.org_id, inp.ticket_id, len(trace_steps), tool_calls, total_ms,
            )

        return decision

    # ── Context builder ───────────────────────────────────────────────────

    async def _build_context(
        self,
        inp: AgentInput,
        clean_query: str,
        m: MetricsCollector,
    ) -> AgentContext:
        ctx = AgentContext()

        # RAG retrieval — use pre-provided context if caller already ran it
        if inp.rag_context is not None:
            ctx.rag_context_text = inp.rag_context
        else:
            m.start("retrieval")
            try:
                docs = await retriever.retrieve(
                    org_id=inp.org_id,
                    query=clean_query,
                    top_k=settings.top_k_retrieval * 2,
                )
                reranked = await reranker.rerank(
                    org_id=inp.org_id,
                    query=clean_query,
                    docs=docs,
                    top_n=settings.top_k_retrieval,
                )
                ctx.rag_docs = reranked
                ctx.rag_context_text = prompt_builder.build_rag_context(reranked)
            except Exception as exc:
                logger.warning("RAG retrieval failed (non-fatal): %s", exc)
                ctx.rag_context_text = "(retrieval unavailable)"
            m.stop("retrieval")
            m.record("rag_docs", len(ctx.rag_docs))

        # Memory — use pre-provided history if caller already loaded it
        if inp.history is not None:
            ctx.history = inp.history
        else:
            m.start("memory_read")
            try:
                ctx.history = await ticket_memory.get_recent_messages(
                    org_id=inp.org_id,
                    ticket_id=inp.ticket_id,
                    limit=inp.ticket_context.get("context_window", MEMORY_WINDOW),
                )
            except Exception as exc:
                logger.warning("Memory read failed (non-fatal): %s", exc)
                ctx.history = []
            m.stop("memory_read")

        return ctx

    # ── Decision parsing ──────────────────────────────────────────────────

    def _parse_and_validate(
        self, raw_content: str, mode: AgentMode
    ) -> AgentDecision:
        """
        Extract JSON from raw LLM output, validate it, and return AgentDecision.
        Returns a safe fallback decision on any parse/validation error.
        """
        try:
            data = extract_json(raw_content)
        except ValueError as exc:
            logger.warning("JSON extraction failed: %s | raw=%r", exc, raw_content[:200])
            return AgentDecision(
                **build_fallback_decision_dict(mode.value, f"JSON parse error: {exc}")
            )

        # Normalise mode field — always use the caller's mode
        data["mode"] = mode.value

        try:
            agent_validator.validate(data, mode.value)
        except ValidationError as exc:
            logger.warning("Decision validation failed: %s | data=%s", exc, data)
            return AgentDecision(
                **build_fallback_decision_dict(mode.value, f"Validation error: {exc}")
            )

        # Coerce confidence to float in [0, 1]
        data["confidence"] = round(
            min(1.0, max(0.0, float(data.get("confidence", 0.0)))), 4
        )

        # Fill optional fields with safe defaults
        data.setdefault("tool", None)
        data.setdefault("tool_input", {})
        data.setdefault("tool_result", None)
        data.setdefault("metadata", {})

        return AgentDecision(**data)

    # ── Metrics ───────────────────────────────────────────────────────────

    def _emit_metrics(
        self,
        m: MetricsCollector,
        inp: AgentInput,
        decision: AgentDecision,
        tool_calls: int,
        agent_steps: int = 0,
    ) -> Dict[str, Any]:
        return m.emit(
            org_id=inp.org_id,
            ticket_id=inp.ticket_id,
            mode=inp.mode.value,
            action=decision.action.value,
            confidence=decision.confidence,
            tool_calls=tool_calls,
            agent_steps=agent_steps,
            tool=decision.tool,
        )

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _build_trace(
        inp: AgentInput,
        steps: list[DryRunStep],
        final: AgentDecision,
    ) -> DryRunTrace:
        return DryRunTrace(
            dry_run=True,
            mode=inp.mode.value,
            org_id=inp.org_id,
            ticket_id=inp.ticket_id,
            query=inp.query,
            steps=steps,
            final_action=final.action.value,
            final_confidence=final.confidence,
            final_message=final.message,
        )

    @staticmethod
    def _safe_refusal(mode: AgentMode, message: str) -> AgentDecision:
        """Return a fully-formed escalate decision for early-exit paths."""
        return AgentDecision(
            mode=mode,
            action=AgentAction.ESCALATE,
            confidence=0.0,
            reasoning="Early-exit safety refusal",
            message=message or (
                "I'm sorry, but I can't process that request. "
                "A support agent will follow up shortly."
            ),
        )


# ── Module-level singleton ────────────────────────────────────────────────────
unified_agent = UnifiedAgent()
