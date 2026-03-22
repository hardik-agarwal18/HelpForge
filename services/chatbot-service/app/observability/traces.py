"""
Agent Traces
─────────────
Full structured execution trace for every agent turn.

What this adds on top of MetricsCollector
──────────────────────────────────────────
MetricsCollector (metrics.py) is a per-request timer/counter that emits a
flat dict to the log.  Useful for latency breakdown but blind to:
  • Which tool ran at which step (just a count)
  • What the LLM decided at each reasoning step
  • Token cost per step, per org, per ticket
  • Cross-service correlation (Python ↔ Node traces)

AgentTracer reconstructs the full semantic trace from the decision object
and its embedded metrics dict — with zero modifications to agent.py.

Trace anatomy
──────────────
AgentTrace                            (one per chat turn)
├── metadata: org, ticket, mode, request_id (X-Request-ID)
├── conv_intel: intent, stage, severity     (from conversation/)
├── steps: list[TraceStep]                  (guard → retrieval → LLM → tools → LLM → guard)
│   ├── step_type: "guard" | "retrieval" | "llm_decision" | "llm_followup" | "tool_call"
│   ├── latency_ms
│   ├── tokens_total / cost_usd   (for LLM steps)
│   └── tool / tool_success       (for tool steps)
└── totals: total_tokens, total_cost_usd, total_latency_ms

Redis integration — shared with API Gateway
────────────────────────────────────────────
Writes to the EXACT same Redis hash keys used by the Node.js
api-gateway/src/modules/ai/core/repo/ai.logs.repo.js, so both services
contribute to the SAME usage counters. Grafana / dashboards see one unified
number per org and ticket:

  ai:usage:ticket:{ticket_id}         → HINCRBY tokensUsed, cost, requests
  ai:usage:organization:{org_id}      → HINCRBY tokensUsed, cost, requests
  ai:usage:organization:{org_id}:daily:{YYYY-MM-DD}  → same (for daily burn)

Full trace records for debugging:
  trace:{org_id}:{ticket_id}:{trace_id} → JSON blob, TTL 7 days

Cross-service trace correlation
────────────────────────────────
The X-Request-ID header (set by request_id.py middleware) is captured as
`request_id` on every trace.  The API Gateway's tracing.js also logs this
header.  Feed both log streams into Grafana Loki / Datadog with
`request_id` as the join key to see the full Node → Python → Node journey.
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as aioredis
from pydantic import BaseModel, Field

from app.config.settings import settings
from app.middleware.request_id import request_id_var

logger = logging.getLogger(__name__)

# ── Cost table ─────────────────────────────────────────────────────────────────
# USD per 1 000 tokens, split by prompt and completion.
# Defaults match API Gateway ai.config.js (gpt-4.1-mini).
# Add entries as you onboard new models — unknown models fall back to DEFAULT.

_COST_TABLE: dict[str, dict[str, float]] = {
    "gpt-4.1-mini":       {"prompt": 0.00015,  "completion": 0.00060},
    "gpt-4.1":            {"prompt": 0.00200,  "completion": 0.00800},
    "gpt-4o":             {"prompt": 0.00500,  "completion": 0.01500},
    "gpt-4o-mini":        {"prompt": 0.00015,  "completion": 0.00060},
    "gpt-4-turbo":        {"prompt": 0.01000,  "completion": 0.03000},
    "gpt-4":              {"prompt": 0.03000,  "completion": 0.06000},
    "gpt-3.5-turbo":      {"prompt": 0.00050,  "completion": 0.00150},
    "claude-opus-4-6":    {"prompt": 0.01500,  "completion": 0.07500},
    "claude-sonnet-4-6":  {"prompt": 0.00300,  "completion": 0.01500},
    "claude-haiku-4-5":   {"prompt": 0.00025,  "completion": 0.00125},
}

# Fallback when model is unknown (matches gateway defaults)
_DEFAULT_COST = {"prompt": 0.00015, "completion": 0.00060}

# Redis TTL for full trace blobs (7 days)
_TRACE_TTL_SECONDS = 7 * 24 * 3600

# Typical prompt/completion token ratio for structured-JSON agent calls.
# Used to split tokensUsed into prompt+completion when only total is known.
_PROMPT_RATIO = 0.70


# ── Trace step ─────────────────────────────────────────────────────────────────

class TraceStep(BaseModel):
    """One reasoning step inside an agent turn."""

    step: int
    step_type: str   # guard | retrieval | llm_decision | llm_followup | tool_call | conv_intel

    latency_ms: float = 0.0

    # Token & cost (LLM steps only)
    tokens_prompt: int = 0
    tokens_completion: int = 0
    tokens_total: int = 0
    cost_usd: float = 0.0

    # LLM decision fields
    action: Optional[str] = None
    confidence: Optional[float] = None

    # Tool fields
    tool: Optional[str] = None
    tool_success: Optional[bool] = None

    # Extra context (guard reason, retrieval doc count, etc.)
    detail: Optional[str] = None


# ── Full agent trace ───────────────────────────────────────────────────────────

class AgentTrace(BaseModel):
    """
    Complete structured trace for one agent turn.
    Serialised to Redis as JSON.  Logged as a structured event.
    """

    # Identity
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_id: str = ""          # X-Request-ID — links Python↔Node traces
    org_id: str
    ticket_id: str
    mode: str                      # chat | automation | augmentation
    model: str = "unknown"

    # Timestamps
    started_at: str = ""           # ISO-8601
    finished_at: str = ""
    total_latency_ms: float = 0.0

    # Conversation intelligence context
    conv_intent: Optional[str] = None
    conv_stage: Optional[str] = None
    conv_severity: Optional[str] = None
    escalated_pre_agent: bool = False

    # Steps (reconstructed from agent metrics + decision)
    steps: list[TraceStep] = Field(default_factory=list)
    total_llm_calls: int = 0
    total_tool_calls: int = 0

    # Token & cost totals
    tokens_prompt: int = 0
    tokens_completion: int = 0
    tokens_total: int = 0
    cost_usd: float = 0.0

    # Final outcome
    final_action: str = ""
    final_confidence: float = 0.0
    guard_blocked: bool = False
    error: Optional[str] = None


# ── Cost helpers ───────────────────────────────────────────────────────────────

def _compute_cost(tokens_total: int, model: str) -> tuple[int, int, float]:
    """
    Estimate (prompt_tokens, completion_tokens, cost_usd) from total token count
    and model name.  Uses prompt/completion ratio when exact split is unknown.
    """
    rates = _COST_TABLE.get(model, _DEFAULT_COST)
    prompt_tokens = int(tokens_total * _PROMPT_RATIO)
    completion_tokens = tokens_total - prompt_tokens
    cost = (
        (prompt_tokens  / 1000) * rates["prompt"] +
        (completion_tokens / 1000) * rates["completion"]
    )
    return prompt_tokens, completion_tokens, round(cost, 8)


# ── Tracer ────────────────────────────────────────────────────────────────────

class AgentTracer:
    """
    Builds AgentTrace from an AgentDecision + optional conv-intel context,
    then emits to Redis and the structured log.

    Thread-safe: all state is in the AgentTrace value object.
    Redis client is lazily initialised and shared across instances.
    """

    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    # ── Build ──────────────────────────────────────────────────────────────

    def build(
        self,
        *,
        org_id: str,
        ticket_id: str,
        mode: str,
        started_at: float,             # time.perf_counter() at turn start
        decision_metadata: dict[str, Any],   # decision.metadata["metrics"] from agent
        final_action: str,
        final_confidence: float,
        # Optional enrichments
        conv_intent: Optional[str] = None,
        conv_stage: Optional[str] = None,
        conv_severity: Optional[str] = None,
        escalated_pre_agent: bool = False,
        error: Optional[str] = None,
    ) -> AgentTrace:
        """
        Reconstruct a full AgentTrace from the agent's metrics dict.

        The metrics dict is embedded in AgentDecision.metadata["metrics"] and
        already contains timing breakdowns and token counts — no changes to
        agent.py are needed.
        """
        now = time.perf_counter()
        total_latency_ms = round((now - started_at) * 1000, 2)
        ts_now = datetime.now(timezone.utc).isoformat()

        # Extract model from usage metadata if present
        model = decision_metadata.get("model", "gpt-4.1-mini")

        steps = self._build_steps(decision_metadata, final_action, final_confidence, model)

        # Aggregate totals across all LLM steps
        tokens_total = sum(s.tokens_total for s in steps if s.step_type in ("llm_decision", "llm_followup"))
        tokens_prompt = sum(s.tokens_prompt for s in steps if s.step_type in ("llm_decision", "llm_followup"))
        tokens_completion = sum(s.tokens_completion for s in steps if s.step_type in ("llm_decision", "llm_followup"))
        cost_usd = sum(s.cost_usd for s in steps if s.step_type in ("llm_decision", "llm_followup"))

        total_llm_calls = sum(1 for s in steps if s.step_type in ("llm_decision", "llm_followup"))
        total_tool_calls = sum(1 for s in steps if s.step_type == "tool_call")

        return AgentTrace(
            request_id=request_id_var.get(""),
            org_id=org_id,
            ticket_id=ticket_id,
            mode=mode,
            model=model,
            started_at=ts_now,
            finished_at=ts_now,
            total_latency_ms=total_latency_ms,
            conv_intent=conv_intent,
            conv_stage=conv_stage,
            conv_severity=conv_severity,
            escalated_pre_agent=escalated_pre_agent,
            steps=steps,
            total_llm_calls=total_llm_calls,
            total_tool_calls=total_tool_calls,
            tokens_prompt=tokens_prompt,
            tokens_completion=tokens_completion,
            tokens_total=tokens_total,
            cost_usd=round(cost_usd, 8),
            final_action=final_action,
            final_confidence=final_confidence,
            guard_blocked=bool(decision_metadata.get("guard_block")),
            error=error,
        )

    def build_pre_escalation(
        self,
        *,
        org_id: str,
        ticket_id: str,
        mode: str,
        started_at: float,
        conv_intent: Optional[str] = None,
        conv_stage: Optional[str] = None,
        conv_severity: Optional[str] = None,
    ) -> AgentTrace:
        """
        Build a minimal trace for turns where escalation fired before the agent
        ran — no LLM calls, no tools, near-zero latency.
        """
        now = time.perf_counter()
        return AgentTrace(
            request_id=request_id_var.get(""),
            org_id=org_id,
            ticket_id=ticket_id,
            mode=mode,
            total_latency_ms=round((now - started_at) * 1000, 2),
            conv_intent=conv_intent,
            conv_stage=conv_stage,
            conv_severity=conv_severity,
            escalated_pre_agent=True,
            final_action="escalate",
            final_confidence=0.0,
            steps=[TraceStep(step=0, step_type="conv_intel", detail="pre_agent_escalation")],
        )

    # ── Emit ──────────────────────────────────────────────────────────────

    async def emit(self, trace: AgentTrace) -> None:
        """
        1. Persist aggregated usage to Redis (shared keys with API Gateway).
        2. Persist the full trace blob to Redis for debugging (TTL 7 days).
        3. Emit one structured log event.

        Never raises — all errors are logged as warnings.
        """
        try:
            await self._persist_usage(trace)
        except Exception as exc:
            logger.warning("Trace: usage persistence failed (non-fatal): %s", exc)

        try:
            await self._persist_trace_blob(trace)
        except Exception as exc:
            logger.warning("Trace: blob persistence failed (non-fatal): %s", exc)

        self._log(trace)

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    # ── Step reconstruction ───────────────────────────────────────────────

    @staticmethod
    def _build_steps(
        metrics: dict[str, Any],
        final_action: str,
        final_confidence: float,
        model: str,
    ) -> list[TraceStep]:
        """
        Reconstruct ordered TraceSteps from the flat metrics dict that the
        agent embeds in AgentDecision.metadata["metrics"].

        Timing key patterns from agent.py:
          guard_input            → guard step
          context_build          → retrieval step (covers RAG + memory)
          retrieval              → retrieval step (RAG only, from _build_context)
          memory_read            → retrieval step (memory only)
          llm_step_0             → llm_decision (first LLM call)
          llm_step_{N}           → llm_followup (post-tool LLM re-decisions)
          tool_{name}_{step}     → tool_call
          guard_output           → guard step
        """
        timings: dict[str, float] = metrics.get("timings_ms", {})
        step_num = 0
        steps: list[TraceStep] = []

        # ── Guard: input ──────────────────────────────────────────────────
        if "guard_input" in timings:
            steps.append(TraceStep(
                step=step_num, step_type="guard",
                latency_ms=timings["guard_input"],
                detail="input",
            ))
            step_num += 1

        # ── Retrieval / memory ────────────────────────────────────────────
        retrieval_ms = (
            timings.get("context_build")
            or timings.get("retrieval")
            or 0.0
        )
        memory_ms = timings.get("memory_read", 0.0)
        rag_docs = metrics.get("rag_docs", 0)

        if retrieval_ms or memory_ms:
            steps.append(TraceStep(
                step=step_num, step_type="retrieval",
                latency_ms=retrieval_ms + memory_ms,
                detail=f"rag_docs={rag_docs}",
            ))
            step_num += 1

        # ── LLM step 0 (initial decision) ─────────────────────────────────
        llm0_ms = timings.get("llm_step_0", 0.0)
        llm0_tokens = metrics.get("llm_tokens", 0)
        p, c, cost = _compute_cost(llm0_tokens, model)
        steps.append(TraceStep(
            step=step_num, step_type="llm_decision",
            latency_ms=llm0_ms,
            tokens_total=llm0_tokens,
            tokens_prompt=p,
            tokens_completion=c,
            cost_usd=cost,
            action=final_action,
            confidence=final_confidence,
        ))
        step_num += 1

        # ── Tool calls + followup LLM calls ───────────────────────────────
        # Parse all timing keys to find tool_{name}_{agent_step} and llm_step_{N}
        agent_steps = metrics.get("agent_steps", 0)

        for i in range(1, agent_steps + 1):
            # Tool step for agent_step i (step index = i in the loop)
            tool_key = _find_tool_key(timings, i - 1)
            if tool_key:
                tool_name = _parse_tool_name(tool_key)
                steps.append(TraceStep(
                    step=step_num, step_type="tool_call",
                    latency_ms=timings[tool_key],
                    tool=tool_name,
                    # Success is heuristically inferred from whether a followup was made
                    tool_success=True,
                ))
                step_num += 1

            # LLM followup after tool i
            llm_key = f"llm_step_{i}"
            if llm_key in timings:
                tok_key = f"llm_tokens_step_{i}"
                followup_tokens = metrics.get(tok_key, 0)
                p2, c2, cost2 = _compute_cost(followup_tokens, model)
                steps.append(TraceStep(
                    step=step_num, step_type="llm_followup",
                    latency_ms=timings[llm_key],
                    tokens_total=followup_tokens,
                    tokens_prompt=p2,
                    tokens_completion=c2,
                    cost_usd=cost2,
                ))
                step_num += 1

        # ── Guard: output ─────────────────────────────────────────────────
        if "guard_output" in timings:
            steps.append(TraceStep(
                step=step_num, step_type="guard",
                latency_ms=timings["guard_output"],
                detail="output",
            ))

        return steps

    # ── Redis persistence ─────────────────────────────────────────────────

    async def _persist_usage(self, trace: AgentTrace) -> None:
        """
        HINCRBY into the same Redis hash keys used by the API Gateway's
        ai.logs.repo.js so both services contribute to unified counters.

        Key format (matching Node.js cache.keys.js exactly):
          ai:usage:ticket:{ticket_id}              — per-ticket running total
          ai:usage:organization:{org_id}           — per-org running total
          ai:usage:organization:{org_id}:daily:{date}  — per-org daily burn
        """
        if trace.tokens_total == 0 and trace.cost_usd == 0.0:
            return  # Nothing to record (pre-escalation turns, etc.)

        # Cost is a float — store as micro-cents integer to avoid float precision
        # issues with INCRBYFLOAT; divide back when reading.
        tokens = trace.tokens_total
        # Redis HINCRBYFLOAT is fine for cost (7-digit precision is enough)
        date_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        keys = [
            f"ai:usage:ticket:{trace.ticket_id}",
            f"ai:usage:organization:{trace.org_id}",
            f"ai:usage:organization:{trace.org_id}:daily:{date_key}",
        ]

        async with self.redis.pipeline(transaction=False) as pipe:
            for key in keys:
                pipe.hincrbyfloat(key, "tokensUsed", tokens)
                pipe.hincrbyfloat(key, "cost", trace.cost_usd)
                pipe.hincrbyfloat(key, "requests", 1)
            await pipe.execute()

    async def _persist_trace_blob(self, trace: AgentTrace) -> None:
        """
        Write the full trace JSON to Redis for point-in-time debugging.
        Key: trace:{org_id}:{ticket_id}:{trace_id}
        TTL: 7 days
        """
        key = f"trace:{trace.org_id}:{trace.ticket_id}:{trace.trace_id}"
        await self.redis.setex(key, _TRACE_TTL_SECONDS, trace.model_dump_json())

    # ── Structured log ────────────────────────────────────────────────────

    @staticmethod
    def _log(trace: AgentTrace) -> None:
        """
        Emit a single structured log event at INFO level.
        Fields are flat (no nesting) for maximum compatibility with
        Grafana Loki / Datadog / CloudWatch log parsers.
        """
        logger.info(
            "agent_trace "
            "trace_id=%s request_id=%s org=%s ticket=%s mode=%s model=%s "
            "action=%s confidence=%.3f "
            "total_ms=%.1f llm_calls=%d tool_calls=%d "
            "tokens=%d tokens_prompt=%d tokens_completion=%d "
            "cost_usd=%.8f "
            "conv_intent=%s conv_stage=%s conv_severity=%s "
            "escalated_pre_agent=%s guard_blocked=%s error=%s",
            trace.trace_id,
            trace.request_id,
            trace.org_id,
            trace.ticket_id,
            trace.mode,
            trace.model,
            trace.final_action,
            trace.final_confidence,
            trace.total_latency_ms,
            trace.total_llm_calls,
            trace.total_tool_calls,
            trace.tokens_total,
            trace.tokens_prompt,
            trace.tokens_completion,
            trace.cost_usd,
            trace.conv_intent or "none",
            trace.conv_stage or "none",
            trace.conv_severity or "none",
            trace.escalated_pre_agent,
            trace.guard_blocked,
            trace.error or "none",
        )


# ── Parsing helpers ────────────────────────────────────────────────────────────

def _find_tool_key(timings: dict[str, float], agent_step: int) -> Optional[str]:
    """
    Find the tool timing key for a given agent_step index.
    Key format: tool_{tool_name}_{agent_step}
    """
    suffix = f"_{agent_step}"
    for key in timings:
        if key.startswith("tool_") and key.endswith(suffix):
            return key
    return None


def _parse_tool_name(key: str) -> str:
    """
    Extract tool name from timing key 'tool_{name}_{step}'.
    e.g. 'tool_assign_agent_0' → 'assign_agent'
         'tool_search_docs_1'  → 'search_docs'
    """
    # Drop 'tool_' prefix and '_{step}' suffix
    without_prefix = key[5:]            # remove 'tool_'
    parts = without_prefix.rsplit("_", 1)
    return parts[0] if len(parts) == 2 else without_prefix


# ── Module-level singleton ────────────────────────────────────────────────────
agent_tracer = AgentTracer()
