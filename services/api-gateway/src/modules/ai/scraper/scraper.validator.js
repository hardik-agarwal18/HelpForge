/**
 * Scraper URL Validator
 * ─────────────────────
 * Guards against SSRF (Server-Side Request Forgery) by:
 *   1. Enforcing scheme whitelist (http/https only)
 *   2. Blocking private/reserved IP ranges in the literal hostname
 *   3. Resolving the hostname via DNS and blocking any private IP in the result
 *   4. Enforcing URL length + basic format
 *
 * Why DNS resolution at validation time?
 * ── An attacker can register attacker.com → 192.168.1.1.  A naive validator
 *    that only checks the hostname string won't catch this.  We resolve the
 *    hostname before issuing the HTTP request and block private IPs in the
 *    resolved addresses.
 *
 * IPv4 private ranges blocked:
 *   10.0.0.0/8        — Class-A private
 *   172.16.0.0/12     — Class-B private
 *   192.168.0.0/16    — Class-C private
 *   127.0.0.0/8       — Loopback
 *   169.254.0.0/16    — Link-local (AWS metadata: 169.254.169.254)
 *   0.0.0.0/8         — "This" network
 *   100.64.0.0/10     — Shared address space (RFC 6598)
 *
 * IPv6 ranges blocked:
 *   ::1/128           — Loopback
 *   fc00::/7          — Unique local (fd00::/8 included)
 *   fe80::/10         — Link-local
 *
 * Domain blacklist:
 *   localhost, *.local, *.internal, *.localdomain
 */

import dns from "node:dns/promises";
import { URL } from "node:url";
import logger from "../../../config/logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_URL_LENGTH = 2048;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** Hostname patterns that are always blocked regardless of resolved IP. */
const BLOCKED_HOSTNAME_RE =
  /^(localhost|.*\.local|.*\.internal|.*\.localdomain|.*\.example|.*\.test|.*\.invalid)$/i;

// ── Private IP detection ──────────────────────────────────────────────────────

/**
 * Parse a dotted-decimal IPv4 string into a 32-bit unsigned integer.
 * Returns null if not a valid IPv4.
 */
const parseIPv4 = (addr) => {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
};

/** IPv4 CIDR range descriptor: [networkInt, maskInt]. */
const v4range = (a, b, c, d, prefixLen) => {
  const net = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
  return [net & mask, mask];
};

const PRIVATE_V4_RANGES = [
  v4range(10,   0,   0, 0,  8),   // 10.0.0.0/8
  v4range(172,  16,  0, 0, 12),   // 172.16.0.0/12
  v4range(192, 168,  0, 0, 16),   // 192.168.0.0/16
  v4range(127,   0,  0, 0,  8),   // 127.0.0.0/8 (loopback)
  v4range(169, 254,  0, 0, 16),   // 169.254.0.0/16 (link-local, AWS metadata)
  v4range(  0,   0,  0, 0,  8),   // 0.0.0.0/8
  v4range(100,  64,  0, 0, 10),   // 100.64.0.0/10 (shared address space)
  v4range(192,   0,  2, 0, 24),   // 192.0.2.0/24 (TEST-NET-1)
  v4range(198,  51,100, 0, 24),   // 198.51.100.0/24 (TEST-NET-2)
  v4range(203,   0,113, 0, 24),   // 203.0.113.0/24 (TEST-NET-3)
  v4range(240,   0,  0, 0,  4),   // 240.0.0.0/4 (reserved)
  v4range(255, 255,255,255, 32),  // 255.255.255.255
];

/** Returns true if the IPv4 address string falls into a private/reserved range. */
const isPrivateIPv4 = (addr) => {
  const ip = parseIPv4(addr);
  if (ip === null) return false;
  return PRIVATE_V4_RANGES.some(([net, mask]) => (ip & mask) === net);
};

/**
 * Returns true if an IPv6 address falls into a private/reserved range.
 * We check prefixes by comparing the address string after normalisation.
 */
const isPrivateIPv6 = (addr) => {
  const lower = addr.toLowerCase().replace(/^::ffff:/, ""); // strip IPv4-mapped prefix

  // Try as IPv4-mapped
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) return isPrivateIPv4(lower);

  return (
    lower === "::1" ||                          // loopback
    lower.startsWith("fc") ||                  // unique local fc00::/7
    lower.startsWith("fd") ||                  // unique local fd00::/8
    lower.startsWith("fe80") ||                // link-local fe80::/10
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower === "::"                              // unspecified
  );
};

/** Returns true if the address (IPv4 or IPv6) is private/reserved. */
export const isPrivateIP = (addr) => {
  if (addr.includes(":")) return isPrivateIPv6(addr);
  return isPrivateIPv4(addr);
};

// ── URL Validation ────────────────────────────────────────────────────────────

export class ScraperValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScraperValidationError";
  }
}

/**
 * Validate a URL for safe scraping.
 *
 * Performs:
 *   1. Length check
 *   2. URL parse (throws on malformed)
 *   3. Scheme whitelist
 *   4. Blocked hostname patterns
 *   5. Literal IP address SSRF check
 *   6. DNS resolution → private IP check (async)
 *
 * @param {string} url
 * @throws {ScraperValidationError} if the URL is invalid or unsafe
 * @returns {Promise<URL>} The parsed URL object
 */
export const validateUrl = async (url) => {
  if (!url || typeof url !== "string") {
    throw new ScraperValidationError("URL must be a non-empty string");
  }

  if (url.length > MAX_URL_LENGTH) {
    throw new ScraperValidationError(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters`);
  }

  // 1. Parse — throws on malformed
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScraperValidationError(`Malformed URL: ${url}`);
  }

  // 2. Scheme whitelist
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new ScraperValidationError(
      `Scheme "${parsed.protocol}" is not allowed. Only http and https are permitted.`,
    );
  }

  // 3. No username/password in URL (credential leak / malformed intent)
  if (parsed.username || parsed.password) {
    throw new ScraperValidationError("URLs with credentials (user:pass@host) are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Blocked hostname patterns
  if (BLOCKED_HOSTNAME_RE.test(hostname)) {
    throw new ScraperValidationError(`Hostname "${hostname}" is blocked`);
  }

  // 5. If hostname is a literal IPv4 address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new ScraperValidationError(`IP address "${hostname}" is in a private/reserved range`);
    }
    return parsed; // Literal public IP — skip DNS step
  }

  // 6. If hostname is a literal IPv6 address (inside brackets like [::1])
  if (parsed.hostname.startsWith("[")) {
    const v6 = parsed.hostname.slice(1, -1);
    if (isPrivateIPv6(v6)) {
      throw new ScraperValidationError(`IPv6 address "${v6}" is in a private/reserved range`);
    }
    return parsed;
  }

  // 7. DNS resolution — block DNS rebinding & "attacker.com → 10.0.0.1" attacks
  try {
    const records = await dns.resolve(hostname);
    for (const addr of records) {
      if (isPrivateIP(addr)) {
        logger.warn({ url, hostname, resolvedIp: addr }, "SSRF: hostname resolved to private IP");
        throw new ScraperValidationError(
          `Hostname "${hostname}" resolves to a private/reserved IP address`,
        );
      }
    }
  } catch (err) {
    if (err instanceof ScraperValidationError) throw err;
    // DNS resolution failure (NXDOMAIN, timeout, etc.) — block
    throw new ScraperValidationError(`Cannot resolve hostname "${hostname}": ${err.message}`);
  }

  return parsed;
};
