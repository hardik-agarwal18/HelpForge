"""
Ticket Memory
─────────────
Per-ticket conversation memory backed by Redis.

Two data structures per ticket:

  1. messages  →  Redis List  (key: memory:messages:{org_id}:{ticket_id})
     Ordered chronological message log.  Uses RPUSH / LRANGE for efficient
     append and windowed reads.  TTL resets on every write.

  2. context   →  Redis String / JSON  (key: memory:context:{org_id}:{ticket_id})
     Arbitrary ticket metadata (priority, category, sentiment, resolved_by …)
     that enriches the prompt without taking up message-list slots.

Isolation: every key is namespaced by org_id — cross-tenant access is
structurally impossible.
"""

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config.settings import settings

logger = logging.getLogger(__name__)


class TicketMemory:
    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    # ── Key builders ───────────────────────────────────────────────────────

    def _messages_key(self, org_id: str, ticket_id: str) -> str:
        return f"memory:messages:{org_id}:{ticket_id}"

    def _context_key(self, org_id: str, ticket_id: str) -> str:
        return f"memory:context:{org_id}:{ticket_id}"

    # ── Messages ───────────────────────────────────────────────────────────

    async def add_message(
        self,
        org_id: str,
        ticket_id: str,
        role: str,
        content: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        key = self._messages_key(org_id, ticket_id)
        entry = json.dumps({"role": role, "content": content, "metadata": metadata or {}})

        async with self.redis.pipeline() as pipe:
            pipe.rpush(key, entry)
            pipe.expire(key, settings.memory_ttl_seconds)
            await pipe.execute()

    async def get_recent_messages(
        self,
        org_id: str,
        ticket_id: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Return the `limit` most recent messages (oldest first)."""
        key = self._messages_key(org_id, ticket_id)
        raw = await self.redis.lrange(key, -limit, -1)
        return [json.loads(m) for m in raw]

    # ── Context ────────────────────────────────────────────────────────────

    async def set_context(
        self,
        org_id: str,
        ticket_id: str,
        context: dict[str, Any],
    ) -> None:
        key = self._context_key(org_id, ticket_id)
        await self.redis.setex(key, settings.memory_ttl_seconds, json.dumps(context))

    async def get_context(
        self,
        org_id: str,
        ticket_id: str,
    ) -> Optional[dict[str, Any]]:
        key = self._context_key(org_id, ticket_id)
        raw = await self.redis.get(key)
        return json.loads(raw) if raw else None

    # ── Clear ──────────────────────────────────────────────────────────────

    async def clear(self, org_id: str, ticket_id: str) -> None:
        async with self.redis.pipeline() as pipe:
            pipe.delete(self._messages_key(org_id, ticket_id))
            pipe.delete(self._context_key(org_id, ticket_id))
            await pipe.execute()

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()


ticket_memory = TicketMemory()
