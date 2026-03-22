"""
Embedder
─────────
Thin wrapper around gateway_client.get_embeddings that adds Redis-backed
embedding caching.  Cache key = SHA-256(text)[:16].

Why cache?  Embeddings are deterministic for a given model.  The same FAQ
sentence embedded 1 000 times should only call the API once.  This cuts
token cost and latency significantly during high-load RAG retrieval.
"""

import hashlib
import json
import logging
from typing import Optional

import redis.asyncio as aioredis

from app.config.settings import settings
from app.llm.gateway_client import gateway_client

logger = logging.getLogger(__name__)


class Embedder:
    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    # ── Cache helpers ─────────────────────────────────────────────────────────

    def _cache_key(self, text: str) -> str:
        digest = hashlib.sha256(text.encode()).hexdigest()[:16]
        return f"embed:{digest}"

    # ── Public interface ──────────────────────────────────────────────────────

    async def embed_one(self, org_id: str, text: str) -> list[float]:
        results = await self.embed_many(org_id, [text])
        return results[0]

    async def embed_many(
        self, org_id: str, texts: list[str]
    ) -> list[list[float]]:
        """
        Embed a list of texts with per-text cache lookups.
        Uncached texts are batched into a single API call.
        """
        results: list[list[float] | None] = [None] * len(texts)
        uncached_indices: list[int] = []
        uncached_texts: list[str] = []

        # 1. Cache read
        for i, text in enumerate(texts):
            raw = await self.redis.get(self._cache_key(text))
            if raw:
                results[i] = json.loads(raw)
            else:
                uncached_indices.append(i)
                uncached_texts.append(text)

        # 2. Batch API call for cache misses
        if uncached_texts:
            logger.debug(
                "Embedding %d uncached texts (org=%s)", len(uncached_texts), org_id
            )
            vectors = await gateway_client.get_embeddings(org_id, uncached_texts)

            # 3. Populate results + write cache
            pipe = self.redis.pipeline()
            for orig_idx, text, vector in zip(uncached_indices, uncached_texts, vectors):
                results[orig_idx] = vector
                pipe.setex(
                    self._cache_key(text),
                    settings.cache_ttl_seconds,
                    json.dumps(vector),
                )
            await pipe.execute()

        return results  # type: ignore[return-value]

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()


embedder = Embedder()
