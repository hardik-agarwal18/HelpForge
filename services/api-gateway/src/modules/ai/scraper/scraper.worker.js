/**
 * Scraper BullMQ Worker
 * ──────────────────────
 * Consumes jobs from the `scraper-jobs` queue and calls scraper.service.js.
 *
 * Worker configuration:
 *   concurrency : 3 (configurable via SCRAPER_WORKER_CONCURRENCY)
 *   queue       : scraper-jobs
 *   job types   : scrape-page | cleanup-stale
 *
 * Failure handling:
 *   • Temporary errors (network timeout, transient HTTP 5xx) → BullMQ retries
 *     with exponential backoff (configured in scraper.queue.js: 3 attempts, base 2 s)
 *   • Permanent failures (DNS NXDOMAIN, SSRF block, non-HTML) → BullMQ moves
 *     job to failed set after exhausting retries; DB is updated to FAILED
 *   • DLQ: Failed jobs are also persisted to AIProcessingFailure for visibility
 *
 * Observability:
 *   Every job emits structured pino log entries:
 *     job.start   — picked up by worker
 *     job.done    — completed successfully with latency
 *     job.failed  — retry or permanent failure with error message
 */

import { Worker } from "bullmq";
import db from "../../../config/database.config.js";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";
import { createWorkerConnection } from "../../../config/redis.config.js";
import {
  JOB_CLEANUP_STALE,
  JOB_SCRAPE_PAGE,
  SCRAPER_QUEUE,
} from "./scraper.queue.js";
import { closePuppeteerBrowser } from "./scraper.puppeteer.js";
import {
  deleteStalePages,
  processScrapeJob,
  purgeStaleDbRows,
} from "./scraper.service.js";

const CONCURRENCY = config.scraper.workerConcurrency;

// ── Job handlers ──────────────────────────────────────────────────────────────

const handlers = {
  [JOB_SCRAPE_PAGE]: async (job) => {
    return processScrapeJob(job);
  },

  [JOB_CLEANUP_STALE]: async (job) => {
    const { org_id: orgId, older_than_iso } = job.data;
    const cutoff = new Date(older_than_iso);

    // Phase 1: mark stale + enqueue Qdrant deletions
    const result = await deleteStalePages(orgId, cutoff);

    // Phase 2: hard-delete DB rows older than 25 hours (vector deletion is async)
    const deletedRows = await purgeStaleDbRows(
      orgId,
      new Date(Date.now() - 25 * 60 * 60 * 1_000),
    );

    return { ...result, purgedDbRows: deletedRows };
  },
};

// ── DLQ persistence ───────────────────────────────────────────────────────────

const persistFailure = async (job, error) => {
  try {
    await db.write.aIProcessingFailure.create({
      data: {
        queueName:     SCRAPER_QUEUE,
        jobName:       job?.name ?? "unknown",
        jobId:         job?.id ?? null,
        attemptsMade:  job?.attemptsMade ?? 0,
        retryLimit:    job?.opts?.attempts ?? 3,
        retryable:     false,
        failureReason: error?.message?.slice(0, 1000) ?? "unknown",
        stacktrace:    error?.stack?.slice(0, 3000) ?? null,
        payload:       job?.data ?? {},
      },
    });
  } catch (dbErr) {
    logger.error({ dbErr }, "scraper.worker: failed to persist DLQ entry");
  }
};

// ── Worker initialisation ─────────────────────────────────────────────────────

let worker;

export const startScraperWorker = async () => {
  if (!config.redis.url || config.nodeEnv === "test") {
    logger.info("Scraper worker skipped (missing REDIS_URL or test mode)");
    return null;
  }

  if (worker) {
    await worker.waitUntilReady();
    return worker;
  }

  const connection = createWorkerConnection("scraper");
  if (!connection) {
    logger.info("Scraper worker skipped (Redis unavailable)");
    return null;
  }

  worker = new Worker(
    SCRAPER_QUEUE,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) {
        logger.warn({ jobName: job.name }, "scraper.worker: no handler for job");
        return;
      }

      const startMs = Date.now();
      logger.info({ jobId: job.id, jobName: job.name, orgId: job.data.org_id }, "scraper.worker: job start");

      const result = await handler(job);

      logger.info(
        { jobId: job.id, jobName: job.name, orgId: job.data.org_id, elapsedMs: Date.now() - startMs },
        "scraper.worker: job done",
      );
      return result;
    },
    { connection, concurrency: CONCURRENCY },
  );

  worker.on("completed", (job, result) => {
    logger.debug(
      { jobId: job.id, jobName: job.name, orgId: job.data.org_id, result },
      "scraper.worker: completed",
    );
  });

  worker.on("failed", async (job, error) => {
    const isFinalAttempt = job && job.attemptsMade >= (job.opts?.attempts ?? 3);

    logger.error(
      {
        jobId:        job?.id,
        jobName:      job?.name,
        orgId:        job?.data?.org_id,
        url:          job?.data?.url,
        err:          error.message,
        attempts:     job?.attemptsMade,
        isFinalAttempt,
      },
      "scraper.worker: job failed",
    );

    if (isFinalAttempt) {
      await persistFailure(job, error);
    }
  });

  worker.on("error", (err) => {
    logger.error({ err }, "scraper.worker: worker-level error");
  });

  try {
    await worker.waitUntilReady();
    logger.info({ concurrency: CONCURRENCY }, "Scraper worker ready");
    return worker;
  } catch (error) {
    logger.error({ err: error }, "Scraper worker failed to become ready");
    await worker.close().catch(() => {});
    worker = null;
    throw error;
  }
};

/**
 * Graceful shutdown: drain the BullMQ worker then close the Puppeteer browser.
 * Call this from server.js during SIGTERM/SIGINT handling.
 */
export const stopScraperWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await closePuppeteerBrowser();
};

export default { startScraperWorker, stopScraperWorker };
