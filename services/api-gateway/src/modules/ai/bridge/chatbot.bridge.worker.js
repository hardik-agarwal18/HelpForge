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

import { Worker } from "bullmq";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";
import { createRedisClient } from "../../../config/redis.config.js";
import {
  CHATBOT_BRIDGE_QUEUE,
  JOB_ANALYZE_FEEDBACK,
  JOB_EMBED_TEXTS,
  JOB_PROCESS_DOCUMENT,
} from "./chatbot.bridge.queue.js";

const CHATBOT_URL = config.services.chatbot || "http://chatbot-service:8000";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "change-me-shared-secret";

const INTERNAL_HEADERS = {
  "Content-Type": "application/json",
  "X-Internal-Token": INTERNAL_TOKEN,
};

// ── HTTP helper ───────────────────────────────────────────────────────────────

const callChatbot = async (path, body) => {
  const url = `${CHATBOT_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: INTERNAL_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),  // 60 s timeout per job
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatbot ${path} returned ${res.status}: ${text}`);
  }

  return res.json();
};

// ── Job handlers ──────────────────────────────────────────────────────────────

const handlers = {
  [JOB_PROCESS_DOCUMENT]: async (data) => {
    logger.info({ orgId: data.org_id, documentId: data.document_id }, "Processing document");
    return callChatbot("/internal/process-document", data);
  },

  [JOB_EMBED_TEXTS]: async (data) => {
    logger.info({ orgId: data.org_id, count: data.texts?.length }, "Embedding texts");
    return callChatbot("/internal/embed", data);
  },

  [JOB_ANALYZE_FEEDBACK]: async (data) => {
    logger.info({ orgId: data.org_id }, "Analyzing feedback");
    return callChatbot("/internal/analyze-feedback", data);
  },
};

// ── Worker ────────────────────────────────────────────────────────────────────

let worker;

export const startChatbotBridgeWorker = () => {
  if (!config.redis.url || config.nodeEnv === "test") {
    logger.info("Chatbot bridge worker skipped (missing REDIS_URL or test mode)");
    return null;
  }

  if (worker) return worker;

  const connection = createRedisClient();
  if (!connection) {
    logger.info("Chatbot bridge worker skipped (Redis unavailable)");
    return null;
  }

  worker = new Worker(
    CHATBOT_BRIDGE_QUEUE,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) {
        logger.warn({ jobName: job.name }, "No handler for chatbot bridge job");
        return;
      }

      const result = await handler(job.data);
      logger.debug({ jobId: job.id, jobName: job.name }, "Chatbot bridge job completed");
      return result;
    },
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

  logger.info("Chatbot bridge worker started");
  return worker;
};

export default { startChatbotBridgeWorker };
