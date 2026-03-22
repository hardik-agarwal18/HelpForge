"""
Conversation Summarizer
────────────────────────
Prevents Redis memory from growing without bound.

Strategy — sliding-window compression:

  Before:  [msg1, msg2, ..., msg22]
  After:   [SUMMARY of msg1–msg16] + [msg17 … msg22]

Trigger:  message count >= SUMMARIZE_THRESHOLD (20)
Keep:     KEEP_RECENT (6) newest messages verbatim
Compress: everything older is distilled to a single summary entry

The summary entry uses role="system" so the LLM treats it as ground-truth
context, not as part of the customer/agent dialogue.

This is called automatically by the pipeline after writing to memory —
it is transparent to every caller above the pipeline layer.
"""

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config.settings import settings
from app.llm.gateway_client import gateway_client

logger = logging.getLogger(__name__)

SUMMARIZE_THRESHOLD = 20  # Trigger when message count reaches this
KEEP_RECENT = 6            # Always preserve this many recent messages verbatim

_SUMMARY_SYSTEM = """\
You are a concise conversation summarizer for a customer support system.

Summarize the SUPPORT CONVERSATION below into 2–4 sentences covering:
  1. The customer's original issue
  2. Any solutions already attempted
  3. Current resolution state

Output ONLY the summary — no preamble, no labels, no markdown.
"""


class ConversationSummarizer:
    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    def _messages_key(self, org_id: str, ticket_id: str) -> str:
        return f"memory:messages:{org_id}:{ticket_id}"

    async def maybe_summarize(self, org_id: str, ticket_id: str) -> bool:
        """
        If the conversation is long enough, summarize the older half in-place.
        Returns True if summarization was performed.
        """
        key = self._messages_key(org_id, ticket_id)
        total = await self.redis.llen(key)

        if total < SUMMARIZE_THRESHOLD:
            return False

        logger.info(
            "Summarizing conversation: org=%s, ticket=%s, messages=%d",
            org_id, ticket_id, total,
        )

        raw_all = await self.redis.lrange(key, 0, -1)
        all_messages: list[dict[str, Any]] = [json.loads(m) for m in raw_all]

        old_messages = all_messages[:-KEEP_RECENT]
        recent_messages = all_messages[-KEEP_RECENT:]

        # Generate a single summary for the old segment
        summary_text = await self._generate_summary(org_id, old_messages)
        summary_entry = {
            "role": "system",
            "content": f"[Conversation history summary]: {summary_text}",
            "metadata": {"summarized_message_count": len(old_messages)},
        }

        # Atomically replace the list: delete + repopulate
        new_messages = [summary_entry] + recent_messages
        async with self.redis.pipeline() as pipe:
            pipe.delete(key)
            for msg in new_messages:
                pipe.rpush(key, json.dumps(msg))
            pipe.expire(key, settings.memory_ttl_seconds)
            await pipe.execute()

        logger.info(
            "Conversation compacted: %d → %d entries (org=%s, ticket=%s)",
            total, len(new_messages), org_id, ticket_id,
        )
        return True

    async def _generate_summary(
        self, org_id: str, messages: list[dict[str, Any]]
    ) -> str:
        transcript = "\n".join(
            f"{m['role'].upper()}: {m['content']}"
            for m in messages
            if m.get("role") != "system"  # skip any nested summaries
        )
        result = await gateway_client.generate(
            org_id=org_id,
            messages=[{"role": "user", "content": transcript}],
            system_prompt=_SUMMARY_SYSTEM,
        )
        return result.get("content", "").strip()

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()


summarizer = ConversationSummarizer()
