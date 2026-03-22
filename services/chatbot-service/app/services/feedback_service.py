"""
Feedback Service
─────────────────
Stores per-message feedback (helpful / rating / comment) in Redis and
exposes aggregate stats that the Node analyze-feedback worker can query.

Storage:  Redis List — key: `feedback:{org_id}`
          Capped at 1 000 entries per org (ltrim).
          For durable persistence, the Node worker can read these and
          write to Postgres via the API Gateway.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config.settings import settings
from app.models.schemas import FeedbackRequest

logger = logging.getLogger(__name__)

_MAX_FEEDBACK_PER_ORG = 1_000


class FeedbackService:
    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    def _key(self, org_id: str) -> str:
        return f"feedback:{org_id}"

    # ── Write ──────────────────────────────────────────────────────────────

    async def store_feedback(self, request: FeedbackRequest) -> str:
        feedback_id = str(uuid.uuid4())
        record = {
            "id": feedback_id,
            "org_id": request.org_id,
            "ticket_id": request.ticket_id,
            "message_id": request.message_id,
            "rating": request.rating,
            "helpful": request.helpful,
            "comment": request.comment,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        key = self._key(request.org_id)
        async with self.redis.pipeline() as pipe:
            pipe.lpush(key, json.dumps(record))
            pipe.ltrim(key, 0, _MAX_FEEDBACK_PER_ORG - 1)
            await pipe.execute()

        logger.info(
            "Feedback stored: org=%s, ticket=%s, rating=%d, helpful=%s",
            request.org_id,
            request.ticket_id,
            request.rating,
            request.helpful,
        )
        return feedback_id

    # ── Read / aggregate ───────────────────────────────────────────────────

    async def get_stats(self, org_id: str) -> dict[str, Any]:
        key = self._key(org_id)
        raw_items = await self.redis.lrange(key, 0, -1)

        if not raw_items:
            return {"total": 0, "avg_rating": 0.0, "helpful_rate": 0.0}

        items = [json.loads(i) for i in raw_items]
        total = len(items)
        avg_rating = sum(i["rating"] for i in items) / total
        helpful_rate = sum(1 for i in items if i["helpful"]) / total

        return {
            "total": total,
            "avg_rating": round(avg_rating, 2),
            "helpful_rate": round(helpful_rate * 100, 1),
        }

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()


feedback_service = FeedbackService()
