/**
 * Chatbot Bridge Worker
 * ──────────────────────
 * Consumes BullMQ jobs from the `chatbot-bridge` queue and calls the Python
 * chatbot service via HTTP.
 *
 * Why a bridge?  BullMQ is Node/Redis-native.  Python cannot consume BullMQ
 * jobs directly.  This worker translates queue messages into HTTP calls so the
 * Python service stays a pure HTTP microservice.
 *
 * Job flow:
 *   BullMQ → this worker → POST /internal/<endpoint> → chatbot-service (Python)
 */

import { createHash, createHmac } from "node:crypto";
import { Worker } from "bullmq";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";
import { createWorkerConnection } from "../../../config/redis.config.js";
import { runWithJobContext } from "../../../utils/requestId.js";
import {
  CHATBOT_BRIDGE_QUEUE,
  JOB_ANALYZE_FEEDBACK,
  JOB_DELETE_DOCUMENTS,
  JOB_EMBED_TEXTS,
  JOB_PROCESS_DOCUMENT,
  JOB_RE_EMBED_ORG,
} from "./chatbot.bridge.queue.js";
import { CircuitOpenError, chatbotCircuit } from "./chatbot.circuit.js";

const CHATBOT_URL = config.services.chatbot || "http://chatbot-service:8000";
const INTERNAL_TOKEN = config.internal.serviceToken || "change-me-shared-secret";
const SERVICE_ID = "chatbot-bridge-worker";
const HMAC_ENABLED = config.internal.hmacEnabled;

// ── HMAC signing ──────────────────────────────────────────────────────────────

/**
 * Sign a request with HMAC-SHA256.
 *
 * Payload: METHOD\nPATH\nSERVICE_ID\nTIMESTAMP_MS\nSHA256(body)
 *
 * SERVICE_ID is included so the signature is bound to this service's identity.
 * A stolen token from another service cannot forge requests as us.
 *
 * The Python service verifies the signature and also checks:
 *   - timestamp freshness (±INTERNAL_TIMESTAMP_TOLERANCE_SECONDS, default 30 s)
 *   - nonce uniqueness via Redis SET NX (prevents replay within the window)
 */
const signRequest = (method, path, bodyStr) => {
  const timestampMs = Date.now().toString();
  const bodyHash = createHash("sha256").update(bodyStr).digest("hex");
  const payload = `${method.toUpperCase()}\n${path}\n${SERVICE_ID}\n${timestampMs}\n${bodyHash}`;
  const signature = createHmac("sha256", INTERNAL_TOKEN).update(payload).digest("hex");
  return { timestampMs, signature };
};

// ── HTTP helper ───────────────────────────────────────────────────────────────

/**
 * @param {string} path
 * @param {Object} body
 * @param {string} [requestId]  BullMQ job.id — shared trace ID for both Node and Python logs
 */
const callChatbot = async (path, body, requestId) => {
  const url = `${CHATBOT_URL}${path}`;
  const bodyStr = JSON.stringify(body);

  const headers = {
    "Content-Type": "application/json",
    "X-Service-Id": SERVICE_ID,
    "X-Internal-Token": INTERNAL_TOKEN,
  };

  // Propagate the trace ID so Python logs carry the same ID as Node logs.
  if (requestId) {
    headers["X-Request-ID"] = requestId;
  }

  if (HMAC_ENABLED) {
    const { timestampMs, signature } = signRequest("POST", path, bodyStr);
    headers["X-Timestamp"] = timestampMs;
    headers["X-Signature"] = signature;
  }

  return chatbotCircuit.fire(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(60_000),  // 60 s timeout per job
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Chatbot ${path} returned ${res.status}: ${text}`);
    }

    return res.json();
  });
};

// ── Job handlers ──────────────────────────────────────────────────────────────

// Each handler receives (data, job). The originating HTTP requestId is stored
// in data.requestId by withRequestId() at enqueue time. We forward it as
// X-Request-ID so Python logs correlate back to the same HTTP request.
const getTraceId = (data, job) => data.requestId ?? job.id;

const handlers = {
  [JOB_PROCESS_DOCUMENT]: async (data, job) => {
    logger.info({ orgId: data.org_id, documentId: data.document_id }, "Processing document");
    return callChatbot("/internal/process-document", data, getTraceId(data, job));
  },

  [JOB_EMBED_TEXTS]: async (data, job) => {
    logger.info({ orgId: data.org_id, count: data.texts?.length }, "Embedding texts");
    return callChatbot("/internal/embed", data, getTraceId(data, job));
  },

  [JOB_ANALYZE_FEEDBACK]: async (data, job) => {
    logger.info({ orgId: data.org_id }, "Analyzing feedback");
    return callChatbot("/internal/analyze-feedback", data, getTraceId(data, job));
  },

  [JOB_RE_EMBED_ORG]: async (data, job) => {
    logger.info({ orgId: data.org_id, targetVersion: data.target_version }, "Re-embedding stale vectors");
    return callChatbot("/internal/re-embed-org", data, getTraceId(data, job));
  },

  [JOB_DELETE_DOCUMENTS]: async (data, job) => {
    logger.info({ orgId: data.org_id, count: data.document_ids?.length }, "Deleting scraped-page vectors");
    return callChatbot("/internal/scraper/delete-documents", data, getTraceId(data, job));
  },
};

// ── Worker ────────────────────────────────────────────────────────────────────

let worker;

export const startChatbotBridgeWorker = async () => {
  if (!config.redis.url || config.nodeEnv === "test") {
    logger.info("Chatbot bridge worker skipped (missing REDIS_URL or test mode)");
    return null;
  }

  if (worker) {
    await worker.waitUntilReady();
    return worker;
  }

  const connection = createWorkerConnection("chatbot-bridge");
  if (!connection) {
    logger.info("Chatbot bridge worker skipped (Redis unavailable)");
    return null;
  }

  worker = new Worker(
    CHATBOT_BRIDGE_QUEUE,
    // BullMQ passes the lock token as the second arg — required for moveToDelayed
    runWithJobContext(async (job, token) => {
      const handler = handlers[job.name];
      if (!handler) {
        logger.warn({ jobName: job.name }, "No handler for chatbot bridge job");
        return;
      }

      try {
        const result = await handler(job.data, job);
        logger.debug({ jobId: job.id, jobName: job.name }, "Chatbot bridge job completed");
        return result;
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          // Service is down — preserve the job by delaying it past the circuit's
          // recovery window instead of burning through BullMQ retry attempts.
          const delayMs = err.remainingMs + 5_000;
          await job.moveToDelayed(Date.now() + delayMs, token);
          logger.warn(
            { jobId: job.id, jobName: job.name, delayMs, circuit: chatbotCircuit.state },
            "Job delayed — chatbot circuit is OPEN",
          );
          return; // returning (not throwing) tells BullMQ the job was handled
        }
        throw err; // real errors → normal BullMQ retry + backoff
      }
    }),
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, name: job.name }, "Bridge job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: error.message },
      "Bridge job failed",
    );
  });

  try {
    await worker.waitUntilReady();
    logger.info("Chatbot bridge worker ready");
    return worker;
  } catch (error) {
    logger.error({ err: error }, "Chatbot bridge worker failed to become ready");
    await worker.close().catch(() => {});
    worker = null;
    throw error;
  }
};

export const stopChatbotBridgeWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
};

export default { startChatbotBridgeWorker, stopChatbotBridgeWorker };
