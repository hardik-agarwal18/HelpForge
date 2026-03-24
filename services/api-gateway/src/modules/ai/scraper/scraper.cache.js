/**
 * Scraper Redis Cache
 * ────────────────────
 * Lightweight deduplication layer that prevents repeatedly scraping the same
 * URL within a short burst window.
 *
 * Key schema:
 *   scraper:cache:{orgId}:{urlHash}  — presence = "scraped within TTL window"
 *   TTL: 24 hours (configurable via SCRAPER_CACHE_TTL_SECONDS)
 *
 * Why separate from DB status?
 * ── The DB check (ScrapedPage.status + contentHash) is the authoritative
 *    deduplication gate.  This Redis cache is a fast-path circuit-breaker that
 *    prevents even reaching the DB on burst traffic (e.g. ten users all loading
 *    the same pricing page simultaneously).
 *
 * Why use a separate Redis client?
 * ── The shared BullMQ connection uses maxRetriesPerRequest=null, which is
 *    required by BullMQ but makes regular commands block forever on disconnect.
 *    For simple GET/SETEX we want a client that fails fast.
 */

import { createHash } from "node:crypto";
import { getCacheClient } from "../../../config/redis.config.js";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";

const CACHE_TTL_SECONDS =
  config.scraper.cacheTtlSeconds;

const KEY_PREFIX = "scraper:cache:";

// ── URL hash ──────────────────────────────────────────────────────────────────

/** Stable SHA-256 hex of a URL (first 16 bytes = 32 hex chars — plenty for a cache key). */
export const hashUrl = (url) =>
  createHash("sha256").update(url).digest("hex").slice(0, 32);

// ── Cache service ─────────────────────────────────────────────────────────────

class ScraperCache {
  constructor() {
    this._client = null;
  }

  /** Lazy initialisation — called on first use. */
  _redis() {
    if (!this._client) {
      this._client = getCacheClient();
    }
    return this._client;
  }

  _key(orgId, urlHash) {
    return `${KEY_PREFIX}${orgId}:${urlHash}`;
  }

  /**
   * Returns true when the URL has already been scraped within the TTL window.
   * Returns false on any Redis error (fail open — let the DB decide).
   */
  async isCached(orgId, url) {
    const redis = this._redis();
    if (!redis) return false;

    const urlHash = hashUrl(url);
    try {
      const val = await redis.get(this._key(orgId, urlHash));
      return val !== null;
    } catch (err) {
      logger.warn({ err, orgId, urlHash }, "scraper.cache: GET failed (fail open)");
      return false;
    }
  }

  /**
   * Mark a URL as recently scraped — sets the cache key with TTL.
   * Silently swallows Redis errors (non-critical).
   */
  async markScraped(orgId, url) {
    const redis = this._redis();
    if (!redis) return;

    const urlHash = hashUrl(url);
    try {
      await redis.setex(this._key(orgId, urlHash), CACHE_TTL_SECONDS, "1");
    } catch (err) {
      logger.warn({ err, orgId, urlHash }, "scraper.cache: SETEX failed (non-fatal)");
    }
  }

  /**
   * Evict the cache entry for a URL (used when forcing a re-scrape).
   */
  async invalidate(orgId, url) {
    const redis = this._redis();
    if (!redis) return;

    const urlHash = hashUrl(url);
    try {
      await redis.del(this._key(orgId, urlHash));
    } catch (err) {
      logger.warn({ err, orgId, urlHash }, "scraper.cache: DEL failed (non-fatal)");
    }
  }

  /**
   * Return remaining TTL in seconds, or -1 if not cached, -2 if no TTL.
   */
  async ttl(orgId, url) {
    const redis = this._redis();
    if (!redis) return -1;

    const urlHash = hashUrl(url);
    try {
      return await redis.ttl(this._key(orgId, urlHash));
    } catch {
      return -1;
    }
  }

  async close() {
    this._client = null;
  }
}

export const scraperCache = new ScraperCache();
export default scraperCache;
