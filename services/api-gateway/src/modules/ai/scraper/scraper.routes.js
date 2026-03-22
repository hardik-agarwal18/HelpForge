/**
 * Scraper Routes
 * ───────────────
 * Express router for the web scraper agent system.
 *
 * Mounted at: /api/ai/scraper
 *
 * Endpoints:
 *   POST   /enqueue             — check + enqueue a URL for scraping
 *   GET    /status/:orgId/:urlHash — current scrape status for a URL
 *   GET    /stats/:orgId        — scraping statistics for an org
 *   DELETE /pages/:orgId/:urlHash — manually invalidate/re-scrape a URL
 *
 * Auth: JWT (requireAuth middleware) — these endpoints are called from
 * authenticated admin / widget-backend flows, NOT directly from the public
 * widget embed.  The public widget calls the chatbot service which internally
 * triggers scraping via checkAndEnqueue.
 *
 * Rate limiting:
 *   /enqueue: in-process rate limit per (orgId) via a simple counter map.
 *   A proper Redis-backed rate limiter (like scraper.cache.js) can replace
 *   this for multi-instance deployments.
 */

import { Router } from "express";
import prisma from "../../../config/database.config.js";
import logger from "../../../config/logger.js";
import { requireAuth } from "../../auth/auth.middleware.js";
import { scraperCache, hashUrl } from "./scraper.cache.js";
import { checkAndEnqueue, deleteStalePages } from "./scraper.service.js";

const router = Router();

// ── POST /enqueue ─────────────────────────────────────────────────────────────

/**
 * Trigger scraping for a URL.
 *
 * Body: { url: string, org_id: string, priority?: "high"|"normal"|"low" }
 *
 * Response:
 *   200 { status: "queued"|"cached"|"fresh"|"processing"|"rejected", url_hash, job_id? }
 */
router.post("/enqueue", requireAuth, async (req, res, next) => {
  try {
    const { url, org_id: orgId, priority } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }
    if (!orgId || typeof orgId !== "string") {
      return res.status(400).json({ error: "org_id is required" });
    }

    const result = await checkAndEnqueue(orgId, url.trim(), priority);

    if (result.status === "rejected") {
      return res.status(422).json({ status: "rejected", reason: result.reason });
    }

    logger.info({ orgId, url, result }, "scraper.route: enqueue");
    return res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /status/:orgId/:urlHash ───────────────────────────────────────────────

/**
 * Get the current scrape status for a URL.
 * urlHash is the SHA-256 hex of the URL (32 chars, from hashUrl()).
 */
router.get("/status/:orgId/:urlHash", requireAuth, async (req, res, next) => {
  try {
    const { orgId, urlHash } = req.params;

    const page = await prisma.scrapedPage.findUnique({
      where:  { orgId_urlHash: { orgId, urlHash } },
      select: {
        status:         true,
        url:            true,
        contentHash:    true,
        chunkCount:     true,
        lastScrapedAt:  true,
        lastEmbeddedAt: true,
        errorMessage:   true,
        createdAt:      true,
        updatedAt:      true,
      },
    });

    if (!page) {
      return res.status(404).json({ error: "URL not found in scrape registry" });
    }

    return res.json(page);
  } catch (err) {
    next(err);
  }
});

// ── GET /stats/:orgId ─────────────────────────────────────────────────────────

/**
 * Aggregate scraping stats for an organisation.
 * Useful for dashboards and alerting.
 */
router.get("/stats/:orgId", requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;

    const [statusCounts, totals] = await Promise.all([
      // Status breakdown
      prisma.scrapedPage.groupBy({
        by:     ["status"],
        where:  { orgId },
        _count: { _all: true },
      }),
      // Aggregate metrics
      prisma.scrapedPage.aggregate({
        where:  { orgId },
        _count: { _all: true },
        _sum:   { chunkCount: true },
        _max:   { lastScrapedAt: true, lastEmbeddedAt: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      statusCounts.map((r) => [r.status.toLowerCase(), r._count._all]),
    );

    return res.json({
      orgId,
      total:          totals._count._all,
      totalChunks:    totals._sum.chunkCount ?? 0,
      lastScrapedAt:  totals._max.lastScrapedAt,
      lastEmbeddedAt: totals._max.lastEmbeddedAt,
      byStatus,
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /pages/:orgId/:urlHash ─────────────────────────────────────────────

/**
 * Force-invalidate a scraped page, clearing cache + DB + re-enqueueing.
 * Useful when you know a page has changed but the hash-based dedup won't catch it
 * (e.g. the content is identical but the embedding model changed).
 */
router.delete("/pages/:orgId/:urlHash", requireAuth, async (req, res, next) => {
  try {
    const { orgId, urlHash } = req.params;

    const page = await prisma.scrapedPage.findUnique({
      where:  { orgId_urlHash: { orgId, urlHash } },
      select: { url: true, status: true },
    });

    if (!page) {
      return res.status(404).json({ error: "URL not found" });
    }

    // Evict cache
    await scraperCache.invalidate(orgId, page.url);

    // Delete DB row so checkAndEnqueue sees it as fresh
    await prisma.scrapedPage.delete({
      where: { orgId_urlHash: { orgId, urlHash } },
    });

    // Re-enqueue
    const result = await checkAndEnqueue(orgId, page.url, "high");

    return res.json({ invalidated: true, url: page.url, enqueue: result });
  } catch (err) {
    next(err);
  }
});

// ── POST /cleanup/:orgId (admin) ──────────────────────────────────────────────

/**
 * Manually trigger cleanup for an org (admin use, also called by cron).
 * Body: { older_than_days?: number }  (default 30)
 */
router.post("/cleanup/:orgId", requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const days      = parseInt(req.body.older_than_days, 10) || 30;
    const cutoff    = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);

    const result = await deleteStalePages(orgId, cutoff);
    return res.json({ orgId, cutoff, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
