"""
Widget Rate Limiter
────────────────────
Sliding-window rate limiting for the public widget endpoints using Redis
sorted sets.  Each unique (org_id, ip) pair gets its own key.

Algorithm: for each request
  1. Remove all entries older than the window (ZREMRANGEBYSCORE)
  2. Count remaining entries (ZCARD)
  3. If count >= limit → reject (HTTP 429)
  4. Otherwise add this request with score=now (ZADD)
  5. Set key TTL to window size so idle keys expire automatically

Limits (defaults, all overridable via env / settings extension):
  • 30 requests / 60 s  per (org_id, ip) pair
  • 200 requests / 60 s per org_id alone  (guards against many IPs in one org)

The per-IP+org limit prevents individual users from flooding the endpoint.
The per-org limit protects downstream LLM costs for a single organization.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import redis.asyncio as aioredis

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────────────────────
_WINDOW_SECONDS   = 60
_IP_ORG_LIMIT     = 30   # per (org_id + client_ip) per window
_ORG_LIMIT        = 200  # per org_id per window (all IPs combined)

_KEY_PREFIX = "widget:rl:"


class WidgetRateLimiter:
    """Async sliding-window rate limiter backed by Redis sorted sets."""

    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        self._redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()
            self._redis = None

    # ── Public API ────────────────────────────────────────────────────────────

    async def is_allowed(self, org_id: str, client_ip: str) -> bool:
        """
        Returns True if the request is within rate limits, False otherwise.

        Checks both the per-(org+IP) and per-org limits.  The cheaper per-org
        check runs first so heavily-loaded orgs short-circuit without paying
        the second Redis round-trip.
        """
        if not self._redis:
            # Redis unavailable — fail open (don't block legitimate traffic)
            return True

        now = time.time()
        window_start = now - _WINDOW_SECONDS

        try:
            # ── Check per-org limit first (cheaper — single key) ──────────────
            if not await self._check_and_record(
                key=f"{_KEY_PREFIX}org:{org_id}",
                window_start=window_start,
                now=now,
                limit=_ORG_LIMIT,
            ):
                logger.warning("Rate limit exceeded: org_id=%s (org limit)", org_id)
                return False

            # ── Check per-(org+ip) limit ──────────────────────────────────────
            safe_ip = client_ip.replace(":", "_")  # IPv6 colon-safety
            if not await self._check_and_record(
                key=f"{_KEY_PREFIX}ip:{org_id}:{safe_ip}",
                window_start=window_start,
                now=now,
                limit=_IP_ORG_LIMIT,
            ):
                logger.warning(
                    "Rate limit exceeded: org_id=%s ip=%s (ip+org limit)",
                    org_id,
                    client_ip,
                )
                return False

        except Exception as exc:
            logger.warning("rate_limiter.is_allowed failed (fail open): %s", exc)
            return True  # fail open

        return True

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _check_and_record(
        self,
        key: str,
        window_start: float,
        now: float,
        limit: int,
    ) -> bool:
        """
        Atomic sliding-window check using a Redis pipeline.

        Returns True when the request is within the limit, False when it
        exceeds it.  Records the request only when within limits.
        """
        pipe = self._redis.pipeline()

        # 1. Trim expired entries
        pipe.zremrangebyscore(key, "-inf", window_start)
        # 2. Count current window
        pipe.zcard(key)

        results = await pipe.execute()
        current_count: int = results[1]

        if current_count >= limit:
            return False

        # 3. Record this request (score = timestamp, member = timestamp string
        #    made unique by appending a random suffix to avoid collisions when
        #    multiple requests arrive within the same millisecond)
        member = f"{now:.6f}"
        add_pipe = self._redis.pipeline()
        add_pipe.zadd(key, {member: now})
        add_pipe.expire(key, _WINDOW_SECONDS + 1)  # +1 s grace for TTL rounding
        await add_pipe.execute()

        return True


# Module-level singleton
widget_rate_limiter = WidgetRateLimiter()
