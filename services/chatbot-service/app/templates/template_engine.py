"""
Template Engine  (intent-based, zero LLM cost)
────────────────────────────────────────────────
When the Conversation Intelligence layer detects a known intent with
sufficient confidence, check whether the org has a pre-written template
for that intent.  If yes → return it verbatim (after variable substitution),
skipping embedding, retrieval, re-ranking, and LLM generation entirely.

Why cheaper than FAQMatcher:
  - No embedding call (intent comes free from the detector)
  - No Qdrant round-trip
  - Pure Redis key lookup: O(1), sub-millisecond

Redis key schema:
  template:{org_id}:{intent}    ← org-specific override
  template:global:{intent}      ← global fallback (shared across orgs)

Template format (JSON value):
  {
    "response": "Click here to reset: {reset_url}",
    "variables": ["reset_url"]           ← optional documentation
  }

Variable substitution:
  Placeholders like {order_id}, {email}, {amount} are filled from:
    1. entities  — structured values extracted from the message
    2. context   — ticket_context key/value pairs (org_name, org_url, …)
  Missing variables are left as-is so the response is never silently wrong.

Pipeline position (chat_service.py):
  intent → entities → escalation → [TEMPLATE] → agent
                                        ↓ hit
                               return response directly
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config.settings import settings

logger = logging.getLogger(__name__)

_VAR_RE = re.compile(r"\{(\w+)\}")


@dataclass
class TemplateMatch:
    matched: bool
    response: str
    intent: str    # the intent key that triggered the match
    template_key: str  # Redis key that held the template (for observability)


class TemplateEngine:
    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    # ── Lookup ────────────────────────────────────────────────────────────────

    async def match(
        self,
        org_id: str,
        intent: str,
        confidence: float,
        entities: dict[str, Any],
        context: dict[str, Any],
    ) -> TemplateMatch:
        """
        Return a TemplateMatch.  matched=True only when:
          - confidence ≥ settings.template_intent_confidence_threshold
          - a template exists for this org+intent (or global+intent)
        """
        if confidence < settings.template_intent_confidence_threshold:
            return TemplateMatch(matched=False, response="", intent=intent, template_key="")

        # Org-level override takes priority over global fallback
        for key in (
            f"template:{org_id}:{intent}",
            f"template:global:{intent}",
        ):
            try:
                raw = await self.redis.get(key)
            except Exception as exc:
                logger.warning("Template engine: Redis read failed (non-fatal): %s", exc)
                return TemplateMatch(matched=False, response="", intent=intent, template_key="")

            if raw is None:
                continue

            try:
                data = json.loads(raw)
                template_text: str = data["response"]
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("Template engine: malformed template at %s: %s", key, exc)
                continue

            response = self._render(template_text, entities, context)
            logger.info(
                "Template hit: org=%s intent=%s key=%s", org_id, intent, key
            )
            return TemplateMatch(
                matched=True,
                response=response,
                intent=intent,
                template_key=key,
            )

        return TemplateMatch(matched=False, response="", intent=intent, template_key="")

    # ── Write ─────────────────────────────────────────────────────────────────

    async def upsert(
        self,
        org_id: str,
        intent: str,
        response_template: str,
        ttl_seconds: Optional[int] = None,
    ) -> str:
        """
        Store a template for org_id + intent.  Pass org_id="global" to create
        a fallback used by all orgs that don't have their own override.

        Returns the Redis key where the template was stored.
        """
        key = f"template:{org_id}:{intent}"
        payload = json.dumps({"response": response_template})
        try:
            if ttl_seconds:
                await self.redis.setex(key, ttl_seconds, payload)
            else:
                await self.redis.set(key, payload)
        except Exception as exc:
            logger.error("Template engine: failed to upsert %s: %s", key, exc)
            raise
        logger.info("Template upserted: key=%s", key)
        return key

    async def delete(self, org_id: str, intent: str) -> bool:
        """Delete a template.  Returns True if the key existed."""
        key = f"template:{org_id}:{intent}"
        deleted = await self.redis.delete(key)
        return bool(deleted)

    # ── Rendering ─────────────────────────────────────────────────────────────

    @staticmethod
    def _render(
        template: str,
        entities: dict[str, Any],
        context: dict[str, Any],
    ) -> str:
        """
        Replace {variable} placeholders.  Lookup order: entities → context.
        Unknown placeholders are left unchanged so callers can detect gaps.
        """
        vars_: dict[str, str] = {}
        for k, v in context.items():
            vars_[k] = str(v)
        for k, v in entities.items():
            vars_[k] = str(v)  # entities override context on name collision

        def _replace(m: re.Match) -> str:
            name = m.group(1)
            return vars_.get(name, m.group(0))  # keep placeholder if unknown

        return _VAR_RE.sub(_replace, template)

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()


template_engine = TemplateEngine()
