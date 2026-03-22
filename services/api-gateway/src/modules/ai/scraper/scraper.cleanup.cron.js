/**
 * Scraper Cleanup Cron
 * ─────────────────────
 * Scheduled job that purges scraped-page data older than 30 days.
 *
 * Schedule: daily at 02:00 UTC (configurable via SCRAPER_CLEANUP_CRON)
 *
 * For each organisation in the system:
 *   1. Call deleteStalePages(orgId, cutoff)  — marks STALE + enqueues Qdrant deletion
 *   2. Call purgeStaleDbRows(orgId, purgeAt) — hard-deletes STALE rows (25 h window
 *      gives the async Qdrant deletion job time to complete)
 *
 * Why per-org iteration instead of a single bulk delete?
 * ── Qdrant deletions are scoped per org-collection.  Enqueuing one
 *    `delete-documents` job per org gives the chatbot bridge worker natural
 *    backpressure — it won't flood the Python service with thousands of IDs
 *    at once.  Each org's job is processed sequentially by the worker.
 *
 * Failure strategy:
 *   If an org fails, the error is logged and the cron continues with the next
 *   org.  A failed cleanup is not fatal — the data stays in place and the next
 *   daily run will retry.
 *
 * Requires: node-cron (npm i node-cron)
 */

import cron from "node-cron";
import prisma from "../../../config/database.config.js";
import logger from "../../../config/logger.js";
import { deleteStalePages, purgeStaleDbRows } from "./scraper.service.js";

const CLEANUP_CRON   = process.env.SCRAPER_CLEANUP_CRON   ?? "0 2 * * *";     // 02:00 UTC daily
const RETENTION_DAYS = parseInt(process.env.SCRAPER_RETENTION_DAYS, 10) || 30;

// ── Core cleanup logic ────────────────────────────────────────────────────────

export const runScrapeCleanup = async () => {
  logger.info({ retentionDays: RETENTION_DAYS }, "scraper.cleanup: start");

  const cutoff  = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  const purgeAt = new Date(Date.now() - 25 * 60 * 60 * 1_000); // 25 h ago

  // Get all orgs that have scraped pages
  const orgs = await prisma.scrapedPage
    .findMany({
      distinct: ["orgId"],
      select:   { orgId: true },
    })
    .then((rows) => rows.map((r) => r.orgId));

  if (orgs.length === 0) {
    logger.info("scraper.cleanup: no orgs with scraped pages — nothing to do");
    return;
  }

  let totalDeleted    = 0;
  let totalPurged     = 0;
  let orgsProcessed   = 0;
  let errors          = 0;

  for (const orgId of orgs) {
    try {
      const { deleted } = await deleteStalePages(orgId, cutoff);
      const purged      = await purgeStaleDbRows(orgId, purgeAt);

      totalDeleted  += deleted;
      totalPurged   += purged;
      orgsProcessed += 1;

      if (deleted > 0 || purged > 0) {
        logger.info(
          { orgId, markedStale: deleted, purgedRows: purged },
          "scraper.cleanup: org processed",
        );
      }
    } catch (err) {
      errors += 1;
      logger.error({ orgId, err: err.message }, "scraper.cleanup: org failed (continuing)");
    }
  }

  logger.info(
    {
      orgsTotal:    orgs.length,
      orgsProcessed,
      errors,
      markedStale:  totalDeleted,
      purgedRows:   totalPurged,
      cutoff,
    },
    "scraper.cleanup: complete",
  );

  return { orgsProcessed, errors, markedStale: totalDeleted, purgedRows: totalPurged };
};

// ── Cron scheduler ────────────────────────────────────────────────────────────

let _task = null;

export const scheduleScrapeCleanup = () => {
  if (_task) return _task;

  if (!cron.validate(CLEANUP_CRON)) {
    logger.error({ schedule: CLEANUP_CRON }, "scraper.cleanup: invalid cron expression — skipping");
    return null;
  }

  _task = cron.schedule(CLEANUP_CRON, async () => {
    try {
      await runScrapeCleanup();
    } catch (err) {
      logger.error({ err }, "scraper.cleanup: cron run failed");
    }
  });

  logger.info({ schedule: CLEANUP_CRON }, "Scraper cleanup cron scheduled");
  return _task;
};

export const stopScrapeCleanup = () => {
  if (_task) {
    _task.stop();
    _task = null;
  }
};

export default { scheduleScrapeCleanup, stopScrapeCleanup, runScrapeCleanup };
