/**
 * Puppeteer Fallback Fetcher
 * ──────────────────────────
 * Activated only when plain HTTP fetch returns thin content from a
 * JS-rendered SPA.  Never called for pages that already have adequate text.
 *
 * Guard:
 *   SCRAPER_PUPPETEER_ENABLED=true  — must be set or all calls throw immediately.
 *   When the env var is absent the module is still importable; callers
 *   should check isSpaWithThinContent() first to avoid the throw in dev.
 *
 * Design choices:
 *   • Singleton browser  — one Chromium process shared across all scrape jobs,
 *     relaunched automatically if it crashes or disconnects.
 *   • Incognito context  — each request gets a fresh BrowserContext so cookies /
 *     local-storage don't bleed between scrapes.
 *   • Resource blocking  — images, fonts, stylesheets, and media are aborted at
 *     the network level; we only need the rendered DOM text.
 *   • waitUntil "networkidle2" — waits until ≤2 in-flight requests for 500 ms;
 *     suitable for SPAs that load data asynchronously before rendering content.
 *
 * Return shape matches fetchPage():
 *   { html: string, contentType: string, byteLength: number }
 */

import puppeteer from "puppeteer";
import logger from "../../../config/logger.js";

// ── Config ─────────────────────────────────────────────────────────────────────

const PUPPETEER_ENABLED =
  process.env.SCRAPER_PUPPETEER_ENABLED === "true";

/** Timeout for a full page navigation (ms). */
const PUPPETEER_TIMEOUT_MS =
  parseInt(process.env.SCRAPER_PUPPETEER_TIMEOUT_MS, 10) || 30_000;

/** Shared with the static fetcher — same cap applies. */
const MAX_PAGE_BYTES =
  parseInt(process.env.SCRAPER_MAX_PAGE_BYTES, 10) || 5 * 1_024 * 1_024;

/** Word-count below which static content is considered "thin". */
const THIN_WORD_THRESHOLD =
  parseInt(process.env.SCRAPER_THIN_WORD_THRESHOLD, 10) || 50;

const USER_AGENT = "HelpForge-Scraper/1.0 (+https://helpforge.io/bot)";

// ── Resource types blocked in Puppeteer ───────────────────────────────────────

const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "stylesheet"]);

// ── Singleton browser ─────────────────────────────────────────────────────────

let _browser = null;

const getBrowser = async () => {
  if (_browser?.connected) return _browser;

  logger.info("puppeteer: launching headless Chromium");
  _browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",   // critical in Docker (/dev/shm default = 64 MB)
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ],
  });

  _browser.on("disconnected", () => {
    logger.warn("puppeteer: browser disconnected — will relaunch on next use");
    _browser = null;
  });

  return _browser;
};

/**
 * Close the shared browser cleanly.
 * Call this during graceful shutdown so the Chromium process doesn't linger.
 */
export const closePuppeteerBrowser = async () => {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      // Ignore — we're shutting down anyway
    }
    _browser = null;
    logger.info("puppeteer: browser closed");
  }
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Navigate to `url` with a real browser and return the fully-rendered HTML.
 *
 * The caller is responsible for URL validation (SSRF check) before calling this.
 *
 * @param {string} url  Validated, non-private URL.
 * @returns {Promise<{ html: string, contentType: string, byteLength: number }>}
 * @throws  {Error}  When Puppeteer is disabled, navigation fails, or size limit exceeded.
 */
export const puppeteerFetchPage = async (url) => {
  if (!PUPPETEER_ENABLED) {
    throw new Error(
      "Puppeteer fallback is disabled (set SCRAPER_PUPPETEER_ENABLED=true to enable)",
    );
  }

  const browser = await getBrowser();
  // Incognito context — cookies / storage don't persist between scrapes
  const context = await browser.createBrowserContext();
  let page;

  try {
    page = await context.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });

    // Drop binary resources we don't need — speeds up navigation significantly
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout:   PUPPETEER_TIMEOUT_MS,
    });

    if (!response) {
      throw new Error(`Puppeteer: no response received for ${url}`);
    }
    if (!response.ok()) {
      throw new Error(`Puppeteer: HTTP ${response.status()} for ${url}`);
    }

    const contentType = response.headers()["content-type"] ?? "text/html";
    const html        = await page.content();                // post-JS rendered DOM
    const byteLength  = Buffer.byteLength(html, "utf-8");

    if (byteLength > MAX_PAGE_BYTES) {
      throw new Error(
        `Puppeteer: rendered page exceeds size limit of ${MAX_PAGE_BYTES} bytes`,
      );
    }

    return { html, contentType, byteLength };
  } finally {
    // Always close the context so the incognito session is released
    try { await context.close(); } catch { /* ignore */ }
  }
};

// ── SPA detection ─────────────────────────────────────────────────────────────

/**
 * Lowercase string tokens that indicate a JS-rendered SPA shell.
 * Checked against the lowercased raw HTML (before Cheerio parses it).
 *
 * Covers: React/CRA, Next.js, Vue 2/3, Nuxt, Angular, Svelte/SvelteKit,
 *         Ember.js, and generic "enable JavaScript" loader pages.
 */
const SPA_SIGNALS = [
  // React / CRA
  'id="root"',
  "id='root'",
  "data-reactroot",
  // Next.js
  "__next_data__",
  // Vue 2 / 3
  'id="app"',
  "id='app'",
  "data-v-app",
  "data-vue-app",
  // Nuxt
  'id="nuxt"',
  "id='nuxt'",
  "window.__nuxt__",
  // Angular
  "ng-version",
  "ng-app",
  // Svelte / SvelteKit
  'id="svelte"',
  "id='svelte'",
  // Ember.js
  'id="ember',
  "data-ember-action",
  // Generic "JavaScript required" loader pages
  "please enable javascript",
  "javascript is required",
  "enable javascript to run",
  "this app requires javascript",
];

/**
 * Returns true when BOTH conditions hold:
 *   (a) The static parse produced fewer words than `minWords`, AND
 *   (b) The raw HTML contains at least one known SPA framework signal.
 *
 * This avoids running Puppeteer on pages that are legitimately short
 * (simple landing pages, 404s) while catching framework shells that
 * render an empty `<div id="root">` on first HTTP load.
 *
 * @param {object} parsed     Result of parseHtml()
 * @param {string} rawHtml    Original HTML string before parsing
 * @param {number} [minWords] Word-count threshold (default: THIN_WORD_THRESHOLD)
 * @returns {boolean}
 */
export const isSpaWithThinContent = (
  parsed,
  rawHtml,
  minWords = THIN_WORD_THRESHOLD,
) => {
  if (parsed.wordCount >= minWords) return false;

  const lowered = rawHtml.toLowerCase();
  return SPA_SIGNALS.some((sig) => lowered.includes(sig));
};
