/**
 * AI Logs Repository
 * ───────────────────
 * Persistence hooks for AI activity and full execution traces.
 *
 * logAIActivity  — lightweight usage entry (token totals + structured log).
 *                  Calls trackAIUsageTotals to bump the Redis hash counters.
 *
 * logAITrace     — full structured trace written to Redis as a JSON blob with
 *                  a 7-day TTL.  Use for debugging, latency analysis, and
 *                  replaying failed decisions.
 *
 * Redis key schema (shared with chatbot-service/app/observability/traces.py)
 * ──────────────────────────────────────────────────────────────────────────
 * Both services increment the SAME hash keys so every Grafana/Datadog query
 * for "total tokens by org" or "total cost by ticket" automatically includes
 * usage from both the Python chatbot-service and the Node automation worker:
 *
 *   ai:usage:ticket:{ticketId}              — per-ticket running total
 *   ai:usage:organization:{organizationId}  — per-org running total
 *   ai:usage:organization:{orgId}:daily:{YYYY-MM-DD}  — daily burn
 *   trace:{orgId}:{ticketId}:{traceId}      — full trace blob, TTL 7 days
 */

import logger from "../../../../config/logger.js";
import {
  buildAIOrganizationUsageCacheKey,
  buildAITicketUsageCacheKey,
} from "../cache/cache.keys.js";
import { incrementHashValues } from "../cache/cache.service.js";
import { getCacheClient } from "../../../../config/redis.config.js";

const TRACE_TTL_SECONDS = 7 * 24 * 3600;

// ── Usage tracking ────────────────────────────────────────────────────────────

const trackAIUsageTotals = async (entry) => {
  const aiUsage = entry?.metadata?.aiUsage;

  if (!aiUsage) {
    return;
  }

  const usageTotals = {
    tokensUsed: aiUsage.tokensUsed || 0,
    cost: aiUsage.cost || 0,
    requests: 1,
  };

  const updates = [];

  if (entry?.ticketId) {
    updates.push(
      incrementHashValues(buildAITicketUsageCacheKey(entry.ticketId), usageTotals),
    );
  }

  if (entry?.organizationId) {
    updates.push(
      incrementHashValues(
        buildAIOrganizationUsageCacheKey(entry.organizationId),
        usageTotals,
      ),
    );
  }

  // Daily breakdown key — same namespace used by chatbot-service traces.py
  if (entry?.organizationId && (aiUsage.tokensUsed || aiUsage.cost)) {
    const today = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
    const dailyKey = `${buildAIOrganizationUsageCacheKey(entry.organizationId)}:daily:${today}`;
    updates.push(incrementHashValues(dailyKey, usageTotals));
  }

  await Promise.all(updates);
};

// ── Activity logger ───────────────────────────────────────────────────────────

/**
 * Logger-backed AI activity persistence hook.
 * Centralises the contract so callers don't depend on a specific table schema.
 *
 * @param {object} entry
 *   { ticketId, organizationId, module, action, metadata: { aiUsage }, createdAt }
 */
export const logAIActivity = async (entry) => {
  const payload = {
    ticketId: entry?.ticketId,
    organizationId: entry?.organizationId,
    module: entry?.module || "ai",
    action: entry?.action || "unknown",
    metadata: entry?.metadata || {},
    createdAt: entry?.createdAt || new Date().toISOString(),
  };

  await trackAIUsageTotals(payload);
  logger.info(payload, "AI activity logged");
  return payload;
};

// ── Full trace logger ─────────────────────────────────────────────────────────

/**
 * Persist a full AI execution trace to Redis and the structured log.
 *
 * Intended callers:
 *   • automation worker (after handleCommentAdded completes)
 *   • augmentation route (after suggestion is generated)
 *   • any call site using tracing.js TraceHandle.finish()
 *     (finish() already calls persistTraceBlob internally — this function
 *      is the explicit API for callers that build trace objects manually)
 *
 * @param {object} trace
 *   A completed trace object from tracing.js TraceHandle or any compatible shape:
 *   {
 *     traceId, requestId, orgId, ticketId, mode, model,
 *     startedAt, finishedAt, totalMs,
 *     steps, totalLlmCalls, totalToolCalls,
 *     tokensPrompt, tokensCompletion, tokensTotal, costUsd,
 *     finalAction, finalConfidence, error
 *   }
 *
 * @returns {Promise<object>}  The same trace object (for chaining / logging).
 */
export const logAITrace = async (trace) => {
  if (!trace) return null;

  // ── 1. Persist usage to shared Redis hash counters ────────────────────────
  if (trace.tokensTotal > 0 || trace.costUsd > 0) {
    const today = new Date().toISOString().slice(0, 10);

    const keys = [
      trace.ticketId ? buildAITicketUsageCacheKey(trace.ticketId) : null,
      trace.orgId    ? buildAIOrganizationUsageCacheKey(trace.orgId)  : null,
      trace.orgId    ? `${buildAIOrganizationUsageCacheKey(trace.orgId)}:daily:${today}` : null,
    ].filter(Boolean);

    const usageTotals = {
      tokensUsed: trace.tokensTotal ?? 0,
      cost:       trace.costUsd    ?? 0,
      requests:   1,
    };

    await Promise.all(keys.map((key) => incrementHashValues(key, usageTotals))).catch(
      (err) => logger.warn({ err }, "logAITrace: usage persistence failed (non-fatal)"),
    );
  }

  // ── 2. Persist full trace blob to Redis (TTL 7 days) ──────────────────────
  const redis = getCacheClient();
  if (redis && trace.traceId && trace.orgId && trace.ticketId) {
    const traceKey = `trace:${trace.orgId}:${trace.ticketId}:${trace.traceId}`;
    redis
      .setex(traceKey, TRACE_TTL_SECONDS, JSON.stringify(trace))
      .catch((err) => logger.warn({ err, traceKey }, "logAITrace: blob write failed (non-fatal)"));
  }

  // ── 3. Structured log event ───────────────────────────────────────────────
  logger.info(
    {
      event:            "agent_trace",
      traceId:          trace.traceId,
      requestId:        trace.requestId ?? "",
      orgId:            trace.orgId,
      ticketId:         trace.ticketId,
      mode:             trace.mode,
      model:            trace.model,
      finalAction:      trace.finalAction,
      finalConfidence:  trace.finalConfidence,
      totalMs:          trace.totalMs,
      totalLlmCalls:    trace.totalLlmCalls,
      totalToolCalls:   trace.totalToolCalls,
      tokensPrompt:     trace.tokensPrompt,
      tokensCompletion: trace.tokensCompletion,
      tokensTotal:      trace.tokensTotal,
      costUsd:          trace.costUsd,
      error:            trace.error ?? null,
    },
    "agent_trace",
  );

  return trace;
};

export default {
  logAIActivity,
  logAITrace,
};
