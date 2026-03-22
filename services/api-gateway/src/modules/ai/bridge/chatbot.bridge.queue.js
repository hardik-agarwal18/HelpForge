/**
 * Chatbot Bridge Queue
 * ─────────────────────
 * BullMQ queue that enqueues jobs for the chatbot bridge worker.
 * The worker consumes these jobs and calls the Python chatbot service via HTTP.
 *
 * Job names:
 *   process-document   — ingest + embed a document into Qdrant
 *   embed-texts        — embed arbitrary texts (ticket comments, KB snippets)
 *   analyze-feedback   — aggregate and surface feedback stats
 */

import { Queue } from "bullmq";
import logger from "../../../config/logger.js";
import { getSharedBullmqConnection } from "../../../config/redis.config.js";

// ── Job name constants ────────────────────────────────────────────────────────
export const CHATBOT_BRIDGE_QUEUE = "chatbot-bridge";
export const JOB_PROCESS_DOCUMENT = "process-document";
export const JOB_EMBED_TEXTS = "embed-texts";
export const JOB_ANALYZE_FEEDBACK = "analyze-feedback";
export const JOB_RE_EMBED_ORG = "re-embed-org";

// ── Queue singleton ───────────────────────────────────────────────────────────
let queue;

const getQueue = () => {
  const connection = getSharedBullmqConnection();
  if (!connection) return null;

  if (!queue) {
    queue = new Queue(CHATBOT_BRIDGE_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return queue;
};

// ── Enqueue helpers ───────────────────────────────────────────────────────────

/**
 * Queue a document for ingestion into the chatbot's RAG pipeline.
 * @param {string} orgId
 * @param {string} documentId
 * @param {string} content  - Raw text content
 * @param {Object} metadata - { filename, type, uploadedBy, … }
 */
export const enqueueProcessDocument = async (orgId, documentId, content, metadata = {}) => {
  const q = getQueue();
  if (!q) {
    logger.warn("Chatbot bridge queue disabled — REDIS_URL not set");
    return { queued: false };
  }

  const job = await q.add(JOB_PROCESS_DOCUMENT, {
    org_id: orgId,
    document_id: documentId,
    content,
    metadata,
    chunk: true,
  });

  logger.info({ jobId: job.id, orgId, documentId }, "Queued process-document job");
  return { queued: true, jobId: job.id };
};

/**
 * Queue texts for embedding (e.g. ticket comments, KB snippets).
 * @param {string} orgId
 * @param {string[]} texts
 * @param {Object[]} metadata - One metadata object per text
 */
export const enqueueEmbedTexts = async (orgId, texts, metadata = []) => {
  const q = getQueue();
  if (!q) {
    logger.warn("Chatbot bridge queue disabled — REDIS_URL not set");
    return { queued: false };
  }

  const job = await q.add(JOB_EMBED_TEXTS, {
    org_id: orgId,
    texts,
    metadata,
  });

  logger.info({ jobId: job.id, orgId, count: texts.length }, "Queued embed-texts job");
  return { queued: true, jobId: job.id };
};

/**
 * Queue a feedback analysis job for an org.
 * @param {string} orgId
 * @param {Object} feedbackData
 */
export const enqueueAnalyzeFeedback = async (orgId, feedbackData = {}) => {
  const q = getQueue();
  if (!q) return { queued: false };

  const job = await q.add(JOB_ANALYZE_FEEDBACK, {
    org_id: orgId,
    feedback_data: feedbackData,
  });

  return { queued: true, jobId: job.id };
};

/**
 * Queue an embedding version migration for an org.
 * Triggers a background scroll of the org's Qdrant collection and re-embeds
 * all chunks whose `embedding_version` does not match the current model version.
 *
 * @param {string} orgId
 * @param {Object} [options]
 * @param {string} [options.targetVersion]  - Override the target version (default: server setting)
 */
export const enqueueReEmbedOrg = async (orgId, options = {}) => {
  const q = getQueue();
  if (!q) {
    logger.warn("Chatbot bridge queue disabled — REDIS_URL not set");
    return { queued: false };
  }

  const job = await q.add(
    JOB_RE_EMBED_ORG,
    {
      org_id: orgId,
      target_version: options.targetVersion ?? null,
    },
    {
      // Migration jobs are long-running; keep a smaller completed history
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );

  logger.info({ jobId: job.id, orgId }, "Queued re-embed-org job");
  return { queued: true, jobId: job.id };
};
