/**
 * AI Tracing — API Gateway
 * ─────────────────────────
 * Structured execution traces for every AI operation that runs inside the
 * Node.js gateway: automation worker, augmentation route, LLM provider calls.
 *
 * Design goal — unified observability with the Python chatbot-service
 * ────────────────────────────────────────────────────────────────────
 * Both services write to the same structured log format and the same Redis
 * key namespace.  A single Grafana dashboard (or Datadog / Loki query) can
 * join Python traces and Node traces using the shared `requestId` field
 * (propagated via X-Request-ID header) and the shared org/ticket identifiers.
 *
 * Shared Redis keys (see also chatbot-service/app/observability/traces.py):
 *   ai:usage:ticket:{ticketId}              — per-ticket running totals
 *   ai:usage:organization:{organizationId}  — per-org running totals
 *   ai:usage:organization:{orgId}:daily:{YYYY-MM-DD}  — daily burn
 *   trace:{orgId}:{ticketId}:{traceId}      — full trace JSON, TTL 7 days
 *
 * Trace anatomy
 * ─────────────
 * startTrace(name, meta)  → TraceHandle
 *   handle.addStep(type, data)   — record one reasoning step
 *   handle.finish(result)        — compute totals, persist, log
 *
 * Structured log event emitted by finish():
 *   agent_trace trace_id=… request_id=… org=… ticket=… mode=… model=…
 *     action=… confidence=… total_ms=… llm_calls=… tool_calls=…
 *     tokens=… tokens_prompt=… tokens_completion=… cost_usd=…
 */

import { randomUUID } from "crypto";
import logger from "../../../../config/logger.js";
import aiConfig from "../config/ai.config.js";
import { getCacheClient } from "../../../../config/redis.config.js";

// ── Cost table (matches chatbot-service/_COST_TABLE) ──────────────────────────
const COST_TABLE = {
  "gpt-4.1-mini":      { prompt: 0.00015,  completion: 0.00060 },
  "gpt-4.1":           { prompt: 0.00200,  completion: 0.00800 },
  "gpt-4o":            { prompt: 0.00500,  completion: 0.01500 },
  "gpt-4o-mini":       { prompt: 0.00015,  completion: 0.00060 },
  "gpt-4-turbo":       { prompt: 0.01000,  completion: 0.03000 },
  "gpt-4":             { prompt: 0.03000,  completion: 0.06000 },
  "gpt-3.5-turbo":     { prompt: 0.00050,  completion: 0.00150 },
  "claude-opus-4-6":   { prompt: 0.01500,  completion: 0.07500 },
  "claude-sonnet-4-6": { prompt: 0.00300,  completion: 0.01500 },
  "claude-haiku-4-5":  { prompt: 0.00025,  completion: 0.00125 },
};

const DEFAULT_COST = {
  prompt:     aiConfig.usage.promptCostPer1kTokens,
  completion: aiConfig.usage.completionCostPer1kTokens,
};

const TRACE_TTL_SECONDS = 7 * 24 * 3600;

// ── Cost calculation ──────────────────────────────────────────────────────────

const computeCost = (promptTokens = 0, completionTokens = 0, model) => {
  const rates = COST_TABLE[model] ?? DEFAULT_COST;
  return Number(
    ((promptTokens / 1000) * rates.prompt + (completionTokens / 1000) * rates.completion).toFixed(8),
  );
};

// ── Redis helpers ─────────────────────────────────────────────────────────────

const persistUsage = async ({ ticketId, organizationId, tokensUsed, cost }) => {
  const redis = getCacheClient();
  if (!redis || !tokensUsed) return;

  const today = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD

  const keys = [
    ticketId      ? `ai:usage:ticket:${ticketId}` : null,
    organizationId ? `ai:usage:organization:${organizationId}` : null,
    organizationId ? `ai:usage:organization:${organizationId}:daily:${today}` : null,
  ].filter(Boolean);

  try {
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.hincrbyfloat(key, "tokensUsed", tokensUsed);
      pipeline.hincrbyfloat(key, "cost", cost);
      pipeline.hincrbyfloat(key, "requests", 1);
    }
    await pipeline.exec();
  } catch (err) {
    logger.warn({ err }, "Trace: usage persistence failed (non-fatal)");
  }
};

const persistTraceBlob = async (trace) => {
  const redis = getCacheClient();
  if (!redis) return;

  const key = `trace:${trace.orgId}:${trace.ticketId}:${trace.traceId}`;
  try {
    await redis.setex(key, TRACE_TTL_SECONDS, JSON.stringify(trace));
  } catch (err) {
    logger.warn({ err }, "Trace: blob persistence failed (non-fatal)");
  }
};

// ── Structured log emit ───────────────────────────────────────────────────────

const emitLog = (trace) => {
  if (!aiConfig.monitoring.enabled) return;

  logger.info(
    {
      event: "agent_trace",
      traceId:           trace.traceId,
      requestId:         trace.requestId,
      orgId:             trace.orgId,
      ticketId:          trace.ticketId,
      mode:              trace.mode,
      model:             trace.model,
      finalAction:       trace.finalAction,
      finalConfidence:   trace.finalConfidence,
      totalMs:           trace.totalMs,
      totalLlmCalls:     trace.totalLlmCalls,
      totalToolCalls:    trace.totalToolCalls,
      tokensPrompt:      trace.tokensPrompt,
      tokensCompletion:  trace.tokensCompletion,
      tokensTotal:       trace.tokensTotal,
      costUsd:           trace.costUsd,
      steps:             trace.steps,
      error:             trace.error ?? null,
    },
    "agent_trace",
  );
};

// ── TraceHandle ───────────────────────────────────────────────────────────────

class TraceHandle {
  /**
   * @param {string} name        Human-readable trace label (e.g. "automation-worker")
   * @param {object} metadata    { orgId, ticketId, mode, requestId, model }
   */
  constructor(name, metadata = {}) {
    this._name      = name;
    this._startedAt = Date.now();
    this._steps     = [];

    this.traceId    = randomUUID();
    this.orgId      = metadata.orgId      ?? "";
    this.ticketId   = metadata.ticketId   ?? "";
    this.mode       = metadata.mode       ?? "automation";
    this.requestId  = metadata.requestId  ?? "";
    this.model      = metadata.model      ?? aiConfig.model;
  }

  /**
   * Record one reasoning step.
   *
   * @param {string} stepType
   *   "llm_decision" | "llm_followup" | "tool_call" | "guard" | "retrieval" | "queue"
   * @param {object} data
   *   { latencyMs, tokensPrompt, tokensCompletion, action, confidence, tool, toolSuccess, detail }
   */
  addStep(stepType, data = {}) {
    const {
      latencyMs       = 0,
      tokensPrompt    = 0,
      tokensCompletion = 0,
      action,
      confidence,
      tool,
      toolSuccess,
      detail,
    } = data;

    const costUsd = computeCost(tokensPrompt, tokensCompletion, this.model);

    this._steps.push({
      step:             this._steps.length,
      stepType,
      latencyMs:        Math.round(latencyMs),
      tokensPrompt,
      tokensCompletion,
      tokensTotal:      tokensPrompt + tokensCompletion,
      costUsd,
      ...(action     != null && { action }),
      ...(confidence != null && { confidence }),
      ...(tool       != null && { tool }),
      ...(toolSuccess != null && { toolSuccess }),
      ...(detail     != null && { detail }),
    });

    return this;   // fluent
  }

  /**
   * Finalise the trace, persist to Redis, and emit structured log.
   *
   * @param {object} result   { action, confidence, error }
   * @returns {object}        Completed trace object
   */
  async finish(result = {}) {
    const totalMs = Date.now() - this._startedAt;

    // Aggregate totals
    const llmSteps = this._steps.filter(
      (s) => s.stepType === "llm_decision" || s.stepType === "llm_followup",
    );
    const toolSteps = this._steps.filter((s) => s.stepType === "tool_call");

    const tokensPrompt     = llmSteps.reduce((a, s) => a + s.tokensPrompt,     0);
    const tokensCompletion = llmSteps.reduce((a, s) => a + s.tokensCompletion, 0);
    const tokensTotal      = tokensPrompt + tokensCompletion;
    const costUsd          = Number(
      llmSteps.reduce((a, s) => a + s.costUsd, 0).toFixed(8),
    );

    const trace = {
      traceId:          this.traceId,
      requestId:        this.requestId,
      orgId:            this.orgId,
      ticketId:         this.ticketId,
      mode:             this.mode,
      model:            this.model,
      startedAt:        new Date(this._startedAt).toISOString(),
      finishedAt:       new Date().toISOString(),
      totalMs,
      steps:            this._steps,
      totalLlmCalls:    llmSteps.length,
      totalToolCalls:   toolSteps.length,
      tokensPrompt,
      tokensCompletion,
      tokensTotal,
      costUsd,
      finalAction:      result.action     ?? "unknown",
      finalConfidence:  result.confidence ?? 0,
      error:            result.error      ?? null,
    };

    // Persist usage (shared keys with Python chatbot-service)
    await persistUsage({
      ticketId:       this.ticketId,
      organizationId: this.orgId,
      tokensUsed:     tokensTotal,
      cost:           costUsd,
    });

    // Persist full trace blob
    await persistTraceBlob(trace);

    // Structured log
    emitLog(trace);

    return trace;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start a new AI trace.
 *
 * @param {string} name       Trace label, e.g. "automation-worker"
 * @param {object} metadata   { orgId, ticketId, mode, requestId, model }
 * @returns {TraceHandle}
 *
 * @example
 *   const trace = startTrace("automation-worker", { orgId, ticketId, requestId });
 *   trace.addStep("llm_decision", { latencyMs: 1200, tokensPrompt: 300, tokensCompletion: 120, action: "respond", confidence: 0.87 });
 *   trace.addStep("tool_call",    { latencyMs: 50, tool: "update_ticket", toolSuccess: true });
 *   await trace.finish({ action: "respond", confidence: 0.87 });
 */
export const startTrace = (name, metadata = {}) => new TraceHandle(name, metadata);

export default { startTrace };
