/**
 * Scraper Service
 * ────────────────
 * Core business logic for the web scraper agent system.
 *
 * Public API
 * ──────────
 *   checkAndEnqueue(orgId, url)      — entry point from the HTTP route
 *   processScrapeJob(job)            — called by the scraper worker
 *   deleteStalePages(orgId, cutoff)  — called by the cleanup cron
 *
 * checkAndEnqueue flow
 * ────────────────────
 *   1. Validate URL (SSRF prevention)
 *   2. Check Redis cache → 429-like "already queued/cached" skip
 *   3. Check DB:
 *        • PROCESSING → another worker has it, skip
 *        • COMPLETED + same hash + within TTL → up-to-date, skip
 *        • Otherwise → upsert DB record (PENDING) + enqueue BullMQ job
 *   4. Set Redis cache (24 h) to absorb burst traffic
 *
 * processScrapeJob flow (runs inside BullMQ worker)
 * ─────────────────────────────────────────────────
 *   1. Validate URL again (job data could be replayed)
 *   2. Mark DB status = PROCESSING
 *   3. Fetch HTML (timeout 15 s, size limit 5 MB)
 *   4. Parse + extract embedding text
 *   5. Compute content hash
 *   6. If hash unchanged vs DB → update lastScrapedAt, skip embedding (cost saving)
 *   7. Enqueue `process-document` on the chatbot bridge (urlHash as document_id)
 *   8. Update DB: COMPLETED, contentHash, chunkCount, timestamps
 *   9. Set Redis cache
 *
 * deleteStalePages flow
 * ─────────────────────
 *   1. Find ScrapedPage rows for orgId where createdAt < cutoff
 *   2. Enqueue `delete-documents` on chatbot bridge (batch)
 *   3. Delete DB rows + mark Redis cache evicted
 */

import { createHash } from "node:crypto";
import prisma from "../../../config/database.config.js";
import logger from "../../../config/logger.js";
import {
  enqueueDeleteDocuments,
  enqueueProcessDocument,
} from "../bridge/chatbot.bridge.queue.js";
import { scraperCache, hashUrl } from "./scraper.cache.js";
import { enqueueScrapingJob } from "./scraper.queue.js";
import { buildEmbeddingText, parseHtml } from "./scraper.parser.js";
import { ScraperValidationError, validateUrl } from "./scraper.validator.js";

// ── Config ────────────────────────────────────────────────────────────────────

/** Pages scraped within this window are considered fresh (no re-embed needed). */
const FRESHNESS_TTL_MS =
  parseInt(process.env.SCRAPER_FRESHNESS_TTL_MS, 10) || 24 * 60 * 60 * 1_000; // 24 h

/** Maximum response body size allowed (5 MB). */
const MAX_PAGE_BYTES =
  parseInt(process.env.SCRAPER_MAX_PAGE_BYTES, 10) || 5 * 1_024 * 1_024;

/** HTTP fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS =
  parseInt(process.env.SCRAPER_FETCH_TIMEOUT_MS, 10) || 15_000;

const USER_AGENT =
  "HelpForge-Scraper/1.0 (+https://helpforge.io/bot)";

// ── Helpers ───────────────────────────────────────────────────────────────────

const hashContent = (text) =>
  createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * Fetch a URL with a size limit and timeout.
 * Returns { html, contentType, byteLength }.
 * Throws on network errors, non-2xx status, or oversized pages.
 */
const fetchPage = async (url) => {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal:   controller.signal,
      redirect: "follow",           // follow up to 20 redirects (node default)
      headers: {
        "User-Agent":      USER_AGENT,
        Accept:            "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control":   "no-cache",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    throw new Error(`Non-HTML content type "${contentType}" for ${url}`);
  }

  // Stream with size cap to avoid reading huge pages into memory
  const reader     = response.body.getReader();
  const chunks     = [];
  let totalBytes   = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_PAGE_BYTES) {
      reader.cancel();
      throw new Error(`Page exceeds size limit of ${MAX_PAGE_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { html: combined.toString("utf-8"), contentType, byteLength: totalBytes };
};

// ── DB helpers ────────────────────────────────────────────────────────────────

const upsertScrapedPage = (orgId, url, urlHash, data) =>
  prisma.scrapedPage.upsert({
    where:  { orgId_urlHash: { orgId, urlHash } },
    create: { orgId, url, urlHash, ...data },
    update: data,
  });

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Entry point from the HTTP route.
 * Returns a status string describing what was done.
 */
export const checkAndEnqueue = async (orgId, url, priority = "normal") => {
  // 1. Validate
  try {
    await validateUrl(url);
  } catch (err) {
    if (err instanceof ScraperValidationError) {
      return { status: "rejected", reason: err.message };
    }
    throw err;
  }

  const urlHash = hashUrl(url);

  // 2. Redis cache fast-path (absorbs concurrent widget loads)
  if (await scraperCache.isCached(orgId, url)) {
    return { status: "cached", urlHash };
  }

  // 3. DB check
  const existing = await prisma.scrapedPage.findUnique({
    where: { orgId_urlHash: { orgId, urlHash } },
    select: { status: true, lastScrapedAt: true },
  });

  if (existing) {
    if (existing.status === "PROCESSING") {
      return { status: "processing", urlHash };
    }

    if (existing.status === "COMPLETED" && existing.lastScrapedAt) {
      const age = Date.now() - existing.lastScrapedAt.getTime();
      if (age < FRESHNESS_TTL_MS) {
        await scraperCache.markScraped(orgId, url); // re-warm cache
        return { status: "fresh", urlHash };
      }
    }
  }

  // 4. Upsert DB as PENDING before enqueuing (prevents races from parallel requests)
  await upsertScrapedPage(orgId, url, urlHash, { status: "PENDING" });

  // 5. Enqueue — jobId dedup prevents double-queueing even on concurrent calls
  const job = await enqueueScrapingJob(orgId, url, priority);

  // 6. Warm cache so the next ~100 concurrent widget loads skip DB
  await scraperCache.markScraped(orgId, url);

  return { status: "queued", urlHash, jobId: job?.id ?? null };
};

/**
 * Called by the scraper worker for each BullMQ job.
 * All errors throw so BullMQ handles retries + DLQ.
 */
export const processScrapeJob = async (job) => {
  const { org_id: orgId, url, url_hash: urlHash } = job.data;

  const startMs = Date.now();
  logger.info({ jobId: job.id, orgId, url }, "scraper: start");

  // ── 1. Re-validate (replay protection) ───────────────────────────────────
  await validateUrl(url);

  // ── 2. Mark PROCESSING in DB ──────────────────────────────────────────────
  await upsertScrapedPage(orgId, url, urlHash, { status: "PROCESSING" });

  // ── 3. Fetch ──────────────────────────────────────────────────────────────
  let html, byteLength;
  try {
    ({ html, byteLength } = await fetchPage(url));
  } catch (fetchErr) {
    await upsertScrapedPage(orgId, url, urlHash, {
      status:       "FAILED",
      errorMessage: fetchErr.message.slice(0, 500),
    });
    throw fetchErr; // BullMQ retries
  }

  // ── 4. Parse HTML ─────────────────────────────────────────────────────────
  const parsed = parseHtml(html, url);
  if (!parsed.body && !parsed.title) {
    const msg = "No meaningful content extracted from page";
    await upsertScrapedPage(orgId, url, urlHash, { status: "FAILED", errorMessage: msg });
    throw new Error(msg);
  }

  const embeddingText = buildEmbeddingText(parsed);

  // ── 5. Content hash ───────────────────────────────────────────────────────
  const contentHash = hashContent(embeddingText);

  // ── 6. Deduplication — skip embedding if content unchanged ────────────────
  const dbRecord = await prisma.scrapedPage.findUnique({
    where:  { orgId_urlHash: { orgId, urlHash } },
    select: { contentHash: true, chunkCount: true },
  });

  const contentChanged = !dbRecord?.contentHash || dbRecord.contentHash !== contentHash;

  if (!contentChanged) {
    logger.info(
      { jobId: job.id, orgId, url, contentHash },
      "scraper: content unchanged — skipping re-embedding",
    );
    await upsertScrapedPage(orgId, url, urlHash, {
      status:        "COMPLETED",
      lastScrapedAt: new Date(),
      errorMessage:  null,
    });
    await scraperCache.markScraped(orgId, url);
    return { skipped: true, reason: "content_unchanged", contentHash };
  }

  // ── 7. Enqueue embedding via chatbot bridge ───────────────────────────────
  // urlHash is used as document_id so the Python service can delete stale
  // chunks for this page before upserting the new ones (idempotent).
  const { jobId: embedJobId } = await enqueueProcessDocument(orgId, urlHash, embeddingText, {
    url,
    content_hash:  contentHash,
    source_type:   "web_page",
    source:        url,
    title:         parsed.title,
    scraped_at:    new Date().toISOString(),
    word_count:    parsed.wordCount,
    byte_length:   byteLength,
  });

  // ── 8. Update DB ──────────────────────────────────────────────────────────
  await upsertScrapedPage(orgId, url, urlHash, {
    status:         "COMPLETED",
    contentHash,
    lastScrapedAt:  new Date(),
    lastEmbeddedAt: new Date(),
    errorMessage:   null,
    // chunkCount updated by chatbot service response (async) — set estimated
    chunkCount:     Math.ceil(parsed.wordCount / 100),
  });

  // ── 9. Warm cache ─────────────────────────────────────────────────────────
  await scraperCache.markScraped(orgId, url);

  const elapsedMs = Date.now() - startMs;
  logger.info(
    {
      jobId: job.id, orgId, url, contentHash,
      wordCount: parsed.wordCount, byteLength, elapsedMs, embedJobId,
    },
    "scraper: completed",
  );

  return { success: true, contentHash, wordCount: parsed.wordCount, elapsedMs };
};

/**
 * Delete all scraped pages (DB + Qdrant vectors) for an org older than `cutoff`.
 * Called by the cleanup cron for each org.
 *
 * @param {string} orgId
 * @param {Date}   cutoff   Rows with createdAt < cutoff are deleted
 * @returns {{ deleted: number, embeddingJobId: string|null }}
 */
export const deleteStalePages = async (orgId, cutoff) => {
  const staleRows = await prisma.scrapedPage.findMany({
    where: {
      orgId,
      createdAt: { lt: cutoff },
      status:    { in: ["COMPLETED", "FAILED", "STALE"] },
    },
    select: { id: true, urlHash: true, url: true },
  });

  if (staleRows.length === 0) {
    return { deleted: 0, embeddingJobId: null };
  }

  const documentIds = staleRows.map((r) => r.urlHash);

  // 1. Kick off Qdrant vector deletion via chatbot bridge
  const { jobId: embeddingJobId } = await enqueueDeleteDocuments(orgId, documentIds);

  // 2. Mark rows as STALE in DB (don't hard-delete until vectors are gone)
  await prisma.scrapedPage.updateMany({
    where: { id: { in: staleRows.map((r) => r.id) } },
    data:  { status: "STALE" },
  });

  // 3. Evict Redis cache entries for each URL
  await Promise.allSettled(
    staleRows.map((r) => scraperCache.invalidate(orgId, r.url)),
  );

  logger.info(
    { orgId, deleted: staleRows.length, cutoff, embeddingJobId },
    "scraper.cleanup: stale pages queued for deletion",
  );

  return { deleted: staleRows.length, embeddingJobId };
};

/**
 * Hard-delete DB rows that have been STALE long enough for the Qdrant
 * deletion job to have completed (called a day after marking STALE).
 */
export const purgeStaleDbRows = async (orgId, olderThan) => {
  const { count } = await prisma.scrapedPage.deleteMany({
    where: {
      orgId,
      status:    "STALE",
      updatedAt: { lt: olderThan },
    },
  });
  return count;
};

export default {
  checkAndEnqueue,
  processScrapeJob,
  deleteStalePages,
  purgeStaleDbRows,
};
