"""
Widget Session Memory
──────────────────────
Redis-backed short-term memory for pre-ticket widget sessions.

Key schema
──────────
  session:messages:{session_id}   — JSON list of {role, content, timestamp}
  session:context:{session_id}    — JSON dict of WidgetContext fields + metadata

Both keys share a 30-minute sliding TTL that resets on every write, so active
conversations stay alive without a fixed expiry.  Idle sessions expire quietly.

This is intentionally separate from app/memory/ticket_memory.py (which stores
per-ticket conversation history with a 24h TTL) to avoid polluting the ticket
memory namespace with pre-ticket sessions.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import redis.asyncio as aioredis

from app.config.settings import settings

logger = logging.getLogger(__name__)

# 30-minute sliding window — resets on every write
_SESSION_TTL_SECONDS = 1800

_MESSAGES_PREFIX = "session:messages:"
_CONTEXT_PREFIX  = "session:context:"


class WidgetSessionMemory:
    """Async Redis-backed session store for widget chat sessions."""

    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Initialise the Redis connection pool (called from app lifespan)."""
        self._redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()
            self._redis = None

    # ── Messages ──────────────────────────────────────────────────────────────

    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Return the conversation history for a session (newest last)."""
        if not self._redis:
            return []
        key = _MESSAGES_PREFIX + session_id
        try:
            raw = await self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("session_memory.get_messages failed: %s", exc)
        return []

    async def append_message(
        self,
        session_id: str,
        role: str,
        content: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Append one message to the session history and reset the TTL.

        Keeps at most 40 messages (≈ 20 turns) to cap Redis memory usage.
        """
        if not self._redis:
            return
        key = _MESSAGES_PREFIX + session_id
        try:
            raw = await self._redis.get(key)
            messages: List[Dict[str, Any]] = json.loads(raw) if raw else []

            entry: Dict[str, Any] = {"role": role, "content": content}
            if extra:
                entry.update(extra)
            messages.append(entry)

            # Hard cap — keep the most recent 40 messages
            if len(messages) > 40:
                messages = messages[-40:]

            await self._redis.setex(key, _SESSION_TTL_SECONDS, json.dumps(messages))
        except Exception as exc:
            logger.warning("session_memory.append_message failed: %s", exc)

    # ── Session context ───────────────────────────────────────────────────────

    async def get_context(self, session_id: str) -> Dict[str, Any]:
        """Return the stored session context dict (empty dict if not found)."""
        if not self._redis:
            return {}
        key = _CONTEXT_PREFIX + session_id
        try:
            raw = await self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("session_memory.get_context failed: %s", exc)
        return {}

    async def save_context(
        self,
        session_id: str,
        context: Dict[str, Any],
    ) -> None:
        """Persist (or overwrite) the session context and reset the TTL."""
        if not self._redis:
            return
        key = _CONTEXT_PREFIX + session_id
        try:
            await self._redis.setex(key, _SESSION_TTL_SECONDS, json.dumps(context))
        except Exception as exc:
            logger.warning("session_memory.save_context failed: %s", exc)

    # ── Bulk helpers ──────────────────────────────────────────────────────────

    async def get_session(
        self, session_id: str
    ) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Fetch messages and context in a single round-trip (pipeline)."""
        if not self._redis:
            return [], {}
        msg_key = _MESSAGES_PREFIX + session_id
        ctx_key = _CONTEXT_PREFIX + session_id
        try:
            pipe = self._redis.pipeline()
            pipe.get(msg_key)
            pipe.get(ctx_key)
            results = await pipe.execute()
            messages = json.loads(results[0]) if results[0] else []
            context  = json.loads(results[1]) if results[1] else {}
            return messages, context
        except Exception as exc:
            logger.warning("session_memory.get_session failed: %s", exc)
            return [], {}

    async def clear(self, session_id: str) -> None:
        """Delete all keys for a session (e.g. after ticket creation)."""
        if not self._redis:
            return
        try:
            await self._redis.delete(
                _MESSAGES_PREFIX + session_id,
                _CONTEXT_PREFIX + session_id,
            )
        except Exception as exc:
            logger.warning("session_memory.clear failed: %s", exc)


# Module-level singleton — shared across all requests
widget_session_memory = WidgetSessionMemory()
