/**
 * Scraper HTML Parser
 * ────────────────────
 * Converts raw HTML into clean, structured text suitable for embedding.
 *
 * Two-pass extraction strategy:
 *   Pass 1 — noise removal: scripts, styles, navs, footers, ads, cookie banners
 *   Pass 2 — signal extraction: title, headings, structured body from <main> /
 *             <article> / role="main" with paragraph-level fallback
 *
 * Output shape:
 *   {
 *     title:    string,          // <title> or og:title or h1
 *     headings: string[],        // all h1-h4 text, deduplicated
 *     body:     string,          // main body prose, newline-delimited paragraphs
 *     metadata: {                // open-graph / meta tag extras
 *       description: string?,
 *       keywords:    string?,
 *       author:      string?,
 *       og_image:    string?,
 *     },
 *     wordCount: number,
 *     charCount: number,
 *   }
 *
 * Noise selectors removed before extraction:
 *   script, style, noscript, svg, iframe, object, embed, canvas,
 *   nav, header, footer, aside,
 *   [role="navigation"], [role="banner"], [role="contentinfo"],
 *   .nav, .navbar, .navigation, .menu, .sidebar, .side-bar,
 *   .header, .footer, .ad, .ads, .advertisement, .cookie-banner,
 *   .cookie-notice, .cookie-consent, .popup, .modal, .overlay,
 *   #nav, #navbar, #header, #footer, #sidebar, #cookie-banner,
 *   .skip-link, .sr-only, .visually-hidden
 *
 * Requires: cheerio  (npm i cheerio)
 */

import * as cheerio from "cheerio";

// ── Limits ────────────────────────────────────────────────────────────────────

/** Max characters of body text kept for embedding (≈100 KB). */
const MAX_BODY_CHARS = 100_000;

// ── Noise selectors ───────────────────────────────────────────────────────────

const NOISE_SELECTORS = [
  // Scripts / styles
  "script", "style", "noscript", "svg", "iframe", "object",
  "embed", "canvas", "template", "link[rel='stylesheet']",

  // Structural noise
  "nav", "header", "footer", "aside",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  "[role='complementary']",

  // Class-based noise
  ".nav", ".navbar", ".navigation", ".menu", ".mega-menu",
  ".sidebar", ".side-bar", ".side-nav",
  ".header", ".footer", ".site-header", ".site-footer",
  ".page-header", ".page-footer",

  // Advertising
  ".ad", ".ads", ".advert", ".advertisement", ".ad-banner",
  ".ad-slot", "[class*='adsbygoogle']",

  // Cookie / consent banners
  ".cookie-banner", ".cookie-notice", ".cookie-consent",
  ".cookie-bar", ".cookie-popup", "#cookie-banner",
  "#cookieConsent", "#cookie-notice", "#gdpr",

  // Modal / overlay
  ".modal", ".overlay", ".popup", ".lightbox",
  "[aria-modal='true']",

  // Accessibility helpers (no visible content)
  ".skip-link", ".sr-only", ".visually-hidden", ".screen-reader-text",

  // Social / share widgets
  ".social-share", ".share-buttons", ".social-links",

  // ID-based noise
  "#nav", "#navbar", "#navigation", "#header", "#footer",
  "#sidebar", "#menu", "#cookie-banner",
].join(", ");

// ── Content selectors (priority order) ───────────────────────────────────────

/**
 * Tried in order — first one that yields meaningful text wins.
 * Fallback is the entire <body>.
 */
const CONTENT_SELECTORS = [
  "main",
  "[role='main']",
  "article",
  ".main-content",
  ".page-content",
  ".content-area",
  ".entry-content",
  ".post-content",
  ".article-content",
  ".article-body",
  "#content",
  "#main-content",
  "#main",
  "#page-content",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const cleanText = (text) =>
  text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const extractMeta = ($, name) =>
  $(`meta[name='${name}']`).attr("content") ||
  $(`meta[property='og:${name}']`).attr("content") ||
  $(`meta[property='twitter:${name}']`).attr("content") ||
  null;

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse raw HTML and return structured, embedding-ready content.
 *
 * @param {string} html   Raw HTML source
 * @param {string} url    Source URL (for relative-link context, not used yet)
 * @returns {ParsedPage}
 */
export const parseHtml = (html, url) => {
  let $;
  try {
    $ = cheerio.load(html, { decodeEntities: true });
  } catch {
    return _emptyResult();
  }

  // ── Pass 1: Remove noise ──────────────────────────────────────────────────
  try {
    $(NOISE_SELECTORS).remove();
  } catch {
    // Malformed selector — ignore, continue with noisy content
  }

  // ── Title ─────────────────────────────────────────────────────────────────
  const title =
    cleanText(
      $("title").first().text() ||
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text() ||
      "",
    ).slice(0, 200);

  // ── Meta tags ─────────────────────────────────────────────────────────────
  const metadata = {
    description: extractMeta($, "description")?.slice(0, 500) ?? null,
    keywords:    extractMeta($, "keywords")?.slice(0, 200) ?? null,
    author:      extractMeta($, "author")?.slice(0, 100) ?? null,
    og_image:    $("meta[property='og:image']").attr("content") ?? null,
  };

  // ── Headings (deduplicated, h1–h4) ───────────────────────────────────────
  const seenHeadings = new Set();
  const headings = [];
  $("h1, h2, h3, h4").each((_, el) => {
    const text = cleanText($(el).text()).slice(0, 300);
    if (text && !seenHeadings.has(text)) {
      seenHeadings.add(text);
      headings.push(text);
    }
  });

  // ── Body text ─────────────────────────────────────────────────────────────
  let $content = null;
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first();
    if (el.length) {
      const candidate = cleanText(el.text());
      if (candidate.length > 200) {          // meaningful — at least a paragraph
        $content = el;
        break;
      }
    }
  }

  // Fallback to body
  if (!$content) {
    $content = $("body");
  }

  // Extract paragraph-level text blocks for better chunk boundary awareness
  const paragraphs = [];
  if ($content) {
    $content.find("p, li, td, th, dt, dd, blockquote, pre, code").each((_, el) => {
      const text = cleanText($(el).text());
      if (text.length >= 20) {               // skip trivially short snippets
        paragraphs.push(text);
      }
    });
  }

  let body;
  if (paragraphs.length > 0) {
    body = paragraphs.join("\n\n");
  } else {
    // Fallback to raw text if no paragraphs found
    body = cleanText($content ? $content.text() : $("body").text());
  }

  // Safety limit
  if (body.length > MAX_BODY_CHARS) {
    body = body.slice(0, MAX_BODY_CHARS) + "\n…[content truncated]";
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const charCount = body.length;

  return { title, headings, body, metadata, wordCount, charCount };
};

/**
 * Convert a ParsedPage into a single embedding-ready text string.
 *
 * Layout:
 *   Title: <title>
 *   [Headings block — newline separated]
 *   [Body]
 *
 * The title and headings are prepended so the embedding model sees
 * structural context before the prose, improving similarity scores.
 */
export const buildEmbeddingText = (parsed) => {
  const parts = [];

  if (parsed.title) {
    parts.push(`Title: ${parsed.title}`);
  }
  if (parsed.metadata.description) {
    parts.push(`Summary: ${parsed.metadata.description}`);
  }
  if (parsed.headings.length > 0) {
    parts.push(parsed.headings.join("\n"));
  }
  if (parsed.body) {
    parts.push(parsed.body);
  }

  return parts.join("\n\n");
};

// ── Private ───────────────────────────────────────────────────────────────────

const _emptyResult = () => ({
  title: "",
  headings: [],
  body: "",
  metadata: { description: null, keywords: null, author: null, og_image: null },
  wordCount: 0,
  charCount: 0,
});
