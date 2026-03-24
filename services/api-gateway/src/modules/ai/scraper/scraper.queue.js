/**
 * Scraper BullMQ Queue
 * ─────────────────────
 * Publishes scraping jobs to the `scraper-jobs` queue.
 * Workers in scraper.worker.js consume from the same queue.
 *
 * Job types
 * ──────────
 *   scrape-page     — fetch, parse, embed one URL
 *   cleanup-stale   — delete vectors + DB rows older than 30 days (triggered by cron)
 *
 * Job shape (scrape-page):
 *   { org_id, url, url_hash, priority }
 *
 * Job shape (cleanup-stale):
 *   { org_id, older_than_iso }   — iso = cutoff date as ISO-8601 string
 *
 * Retry strategy:
 *   attempts: 3
 *   backoff:  exponential, base 2 s
 *
 * Priority:
 *   BullMQ numeric priority: 1 (high) … 10 (low)
 *   We map string "high"|"normal"|"low" to 1/5/10.
 */

import { Queue } from "bullmq";
import { createHash } from "node:crypto";
import { getQueueConnection } from "../../../config/redis.config.js";
import logger from "../../../config/logger.js";

export const SCRAPER_QUEUE    = "scraper-jobs";
export const JOB_SCRAPE_PAGE  = "scrape-page";
export const JOB_CLEANUP_STALE = "cleanup-stale";

const PRIORITY_MAP = { high: 1, normal: 5, low: 10 };

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 3600, count: 500 },   // keep 1 h or 500 entries
  removeOnFail:     { age: 86_400, count: 1_000 }, // keep 24 h or 1 k failures
};

// ── Lazy queue singleton ──────────────────────────────────────────────────────

let _queue = null;

const getQueue = () => {
  if (_queue) return _queue;
  const connection = getQueueConnection();
  if (!connection) {
    logger.warn("Scraper queue unavailable (Redis connection missing)");
    return null;
  }
  _queue = new Queue(SCRAPER_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  return _queue;
};

// ── URL hash helper (exported so service can reuse it) ────────────────────────

export const hashUrl = (url) =>
  createHash("sha256").update(url).digest("hex").slice(0, 32);

// ── Public enqueue helpers ────────────────────────────────────────────────────

/**
 * Enqueue a page scraping job.
 *
 * @param {string} orgId
 * @param {string} url        Full URL including scheme
 * @param {"high"|"normal"|"low"} [priority="normal"]
 * @returns {Promise<import("bullmq").Job|null>}
 */
export const enqueueScrapingJob = async (orgId, url, priority = "normal") => {
  const queue = getQueue();
  if (!queue) return null;

  const urlHash  = hashUrl(url);
  const bullPrio = PRIORITY_MAP[priority] ?? PRIORITY_MAP.normal;

  const job = await queue.add(
    JOB_SCRAPE_PAGE,
    { org_id: orgId, url, url_hash: urlHash },
    {
      ...DEFAULT_JOB_OPTIONS,
      priority: bullPrio,
      // Deduplication key: one active job per (org + url) at a time
      jobId: `scrape:${orgId}:${urlHash}`,
    },
  );

  logger.info({ orgId, url, urlHash, jobId: job.id, priority }, "Scraping job enqueued");
  return job;
};

/**
 * Enqueue a stale-data cleanup job for one organisation.
 *
 * @param {string} orgId
 * @param {Date}   olderThan   Cutoff date — vectors + DB rows created before this are deleted
 * @returns {Promise<import("bullmq").Job|null>}
 */
export const enqueueCleanupJob = async (orgId, olderThan) => {
  const queue = getQueue();
  if (!queue) return null;

  const job = await queue.add(
    JOB_CLEANUP_STALE,
    { org_id: orgId, older_than_iso: olderThan.toISOString() },
    {
      ...DEFAULT_JOB_OPTIONS,
      priority: PRIORITY_MAP.low,
      // One cleanup per org — dedup by orgId + date to prevent stacking
      jobId: `cleanup:${orgId}:${olderThan.toISOString().slice(0, 10)}`,
    },
  );

  logger.info({ orgId, olderThan, jobId: job.id }, "Cleanup job enqueued");
  return job;
};

export default { enqueueScrapingJob, enqueueCleanupJob, SCRAPER_QUEUE };
