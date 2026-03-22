"""
Qdrant Vector Store — multi-tenant, strict org isolation
─────────────────────────────────────────────────────────
Strategy: one collection per org  →  `org_{org_id}`

Why separate collections (not metadata filter)?
  ✓ Zero cross-tenant bleed — a misconfigured filter cannot leak data
  ✓ Simpler RBAC — delete the collection to wipe an org
  ✓ Smaller per-collection index → faster search
  ✗ Collection creation overhead on first document upload (acceptable)
"""

import logging
import uuid
from typing import Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
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
        """Create per-org collection if it does not yet exist."""
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
            PointStruct(id=point_id, vector=vec, payload=payload)
            for point_id, vec, payload in zip(ids, vectors, payloads)
        ]

        await self.client.upsert(
            collection_name=self._collection(org_id),
            points=points,
        )

    # ── Read ───────────────────────────────────────────────────────────────

    async def search(
        self,
        org_id: str,
        query_vector: list[float],
        top_k: int = 5,
        filter_conditions: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        qdrant_filter: Optional[Filter] = None
        if filter_conditions:
            qdrant_filter = Filter(
                must=[
                    FieldCondition(key=k, match=MatchValue(value=v))
                    for k, v in filter_conditions.items()
                ]
            )

        hits = await self.client.search(
            collection_name=self._collection(org_id),
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
            with_payload=True,
        )

        return [
            {"id": str(h.id), "score": h.score, "payload": h.payload or {}}
            for h in hits
        ]

    # ── Delete ─────────────────────────────────────────────────────────────

    async def delete_by_document(self, org_id: str, document_id: str) -> None:
        """Remove all vectors for a given document (used on re-index)."""
        await self.client.delete(
            collection_name=self._collection(org_id),
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id", match=MatchValue(value=document_id)
                    )
                ]
            ),
        )


vector_store = QdrantVectorStore()
