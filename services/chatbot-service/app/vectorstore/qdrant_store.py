"""
Qdrant Vector Store — multi-tenant + hybrid search
────────────────────────────────────────────────────
Isolation strategy: one collection per org  →  `org_{org_id}`

Hybrid search (new):
  Dense path:   cosine vector similarity  (semantic)
  Keyword path: dense vectors filtered by MatchText on `text` payload field
  Merge:        Reciprocal Rank Fusion (RRF) — no score-space normalisation needed

Text index is created automatically on first collection creation.
Existing collections without the index will get it on next ensure_collection() call.
"""

import logging
import uuid
from typing import Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchText,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

from app.config.settings import settings

logger = logging.getLogger(__name__)


class QdrantVectorStore:
    def __init__(self) -> None:
        self._client: Optional[AsyncQdrantClient] = None

    @property
    def client(self) -> AsyncQdrantClient:
        if self._client is None:
            self._client = AsyncQdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key,
            )
        return self._client

    # ── Tenant helpers ─────────────────────────────────────────────────────

    def _collection(self, org_id: str) -> str:
        return f"org_{org_id}"

    async def ensure_collection(self, org_id: str) -> None:
        """Create per-org collection + text index if not yet present."""
        name = self._collection(org_id)
        existing = await self.client.get_collections()
        existing_names = {c.name for c in existing.collections}

        if name not in existing_names:
            await self.client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=settings.vector_size,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("Created Qdrant collection: %s", name)

        # Ensure full-text index on `text` payload field for keyword search.
        # Ensure keyword index on `embedding_version` for stale-chunk scrolls.
        # create_payload_index is idempotent — safe to call every time.
        for field_name, schema in (
            ("text", PayloadSchemaType.TEXT),
            ("embedding_version", PayloadSchemaType.KEYWORD),
        ):
            try:
                await self.client.create_payload_index(
                    collection_name=name,
                    field_name=field_name,
                    field_schema=schema,
                )
            except Exception:
                # Index may already exist — Qdrant raises on duplicate, just ignore
                pass

    # ── Write ──────────────────────────────────────────────────────────────

    async def upsert(
        self,
        org_id: str,
        vectors: list[list[float]],
        payloads: list[dict[str, Any]],
        ids: Optional[list[str]] = None,
    ) -> None:
        await self.ensure_collection(org_id)

        if ids is None:
            ids = [str(uuid.uuid4()) for _ in vectors]

        points = [
            PointStruct(id=pid, vector=vec, payload=payload)
            for pid, vec, payload in zip(ids, vectors, payloads)
        ]
        await self.client.upsert(collection_name=self._collection(org_id), points=points)

    # ── Dense search ───────────────────────────────────────────────────────

    async def search(
        self,
        org_id: str,
        query_vector: list[float],
        top_k: int = 5,
        filter_conditions: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        qdrant_filter = self._build_filter(filter_conditions)
        hits = await self.client.search(
            collection_name=self._collection(org_id),
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
            with_payload=True,
        )
        return [{"id": str(h.id), "score": h.score, "payload": h.payload or {}} for h in hits]

    # ── Keyword-boosted search ─────────────────────────────────────────────

    async def keyword_search(
        self,
        org_id: str,
        query_vector: list[float],
        keywords: list[str],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Vector search filtered to documents whose `text` payload contains
        at least one of the provided keywords (full-text match).

        This surfaces exact-match results (error codes, product names, IDs)
        that may be semantically distant but lexically important.
        """
        if not keywords:
            return []

        # OR across all keywords: must match at least one
        keyword_filter = Filter(
            should=[
                FieldCondition(key="text", match=MatchText(text=kw))
                for kw in keywords
            ]
        )

        try:
            hits = await self.client.search(
                collection_name=self._collection(org_id),
                query_vector=query_vector,
                limit=top_k,
                query_filter=keyword_filter,
                with_payload=True,
            )
            return [
                {"id": str(h.id), "score": h.score, "payload": h.payload or {}}
                for h in hits
            ]
        except Exception as exc:
            # Collection may not have text index yet — degrade gracefully
            logger.debug("Keyword search unavailable: %s", exc)
            return []

    # ── Delete ─────────────────────────────────────────────────────────────

    async def delete_by_document(self, org_id: str, document_id: str) -> None:
        await self.client.delete(
            collection_name=self._collection(org_id),
            points_selector=Filter(
                must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
            ),
        )

    # ── Migration support ──────────────────────────────────────────────────

    async def scroll_stale_chunks(
        self,
        org_id: str,
        current_version: str,
        batch_size: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Return all points in the org's collection whose `embedding_version`
        payload field does NOT equal `current_version`.

        Uses Qdrant's `must_not` filter — only efficient when the
        `embedding_version` keyword index exists (created in ensure_collection).
        """
        stale_filter = Filter(
            must_not=[
                FieldCondition(
                    key="embedding_version",
                    match=MatchValue(value=current_version),
                )
            ]
        )

        stale_points: list[dict[str, Any]] = []
        next_offset = None

        while True:
            result, next_offset = await self.client.scroll(
                collection_name=self._collection(org_id),
                scroll_filter=stale_filter,
                limit=batch_size,
                offset=next_offset,
                with_payload=True,
                with_vectors=False,
            )
            stale_points.extend(
                {"id": str(p.id), "payload": p.payload or {}} for p in result
            )
            if next_offset is None:
                break

        return stale_points

    # ── Helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _build_filter(
        conditions: Optional[dict[str, Any]],
    ) -> Optional[Filter]:
        if not conditions:
            return None
        return Filter(
            must=[
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in conditions.items()
            ]
        )


vector_store = QdrantVectorStore()
