"""
Embedding Version Migration Service
─────────────────────────────────────
Re-embeds all chunks in an org's Qdrant collection that were created with
an older embedding model version.

Why this is needed
──────────────────
When the embedding model changes (e.g. ada-002 → text-embedding-3-large),
existing vectors live in a different latent space.  Querying with a new-model
vector against old-model vectors produces nonsensical similarity scores.

Strategy
────────
1. Scroll the org's Qdrant collection for points where
   `embedding_version` != target_version  (filtered scroll, index-backed).
2. Group stale points by `document_id`.
3. For each document:
   a. Extract chunk texts from payloads (already stored).
   b. Re-embed via embedder (Redis cache prevents duplicate API calls if the
      same text was recently embedded with the new model).
   c. Upsert with original point IDs — vectors are updated in-place,
      no document_id shuffle, no ID drift.
4. Return structured counts for observability.

Concurrency note
────────────────
Jobs are enqueued per-org and processed sequentially within each migration run
to avoid overwhelming the embedding API.  For orgs with tens of thousands of
chunks, consider chunking the scroll into multiple BullMQ jobs upstream.
"""

import logging
from typing import Any

from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.models.schemas import ReEmbedOrgRequest, ReEmbedOrgResponse
from app.vectorstore.qdrant_store import vector_store

logger = logging.getLogger(__name__)


class MigrationService:
    async def run_migration(self, request: ReEmbedOrgRequest) -> ReEmbedOrgResponse:
        """
        Find all stale chunks for the org and re-embed them in-place.

        Stale  = embedding_version payload field != target_version.
        In-place = original Qdrant point IDs are reused (upsert semantics).
        """
        target_version = request.target_version or settings.embedding_version

        # ── 1. Scroll for stale points ────────────────────────────────────
        stale_points = await vector_store.scroll_stale_chunks(
            request.org_id, target_version
        )

        if not stale_points:
            logger.info(
                "Migration: org=%s — no stale chunks (version=%s)",
                request.org_id, target_version,
            )
            return ReEmbedOrgResponse(
                org_id=request.org_id,
                stale_chunks_found=0,
                chunks_re_embedded=0,
                errors=0,
                status="up_to_date",
            )

        logger.info(
            "Migration: org=%s — %d stale chunks found (target_version=%s)",
            request.org_id, len(stale_points), target_version,
        )

        # ── 2. Group by document_id ───────────────────────────────────────
        docs: dict[str, list[dict[str, Any]]] = {}
        for pt in stale_points:
            doc_id = pt["payload"].get("document_id") or pt["id"]
            docs.setdefault(doc_id, []).append(pt)

        # ── 3. Re-embed document by document ─────────────────────────────
        re_embedded = 0
        errors = 0

        for doc_id, points in docs.items():
            try:
                texts = [p["payload"].get("text", "") for p in points]
                if not any(texts):
                    logger.warning(
                        "Migration: org=%s, doc=%s — no text in payloads, skipping",
                        request.org_id, doc_id,
                    )
                    continue

                # Re-embed (embedding cache absorbs repeated calls for the same text)
                vectors = await embedder.embed_many(request.org_id, texts)

                # Rebuild payloads with updated version; all other fields preserved
                payloads = [
                    {**p["payload"], "embedding_version": target_version}
                    for p in points
                ]

                # Reuse existing point IDs → upsert updates vectors in-place
                ids = [p["id"] for p in points]

                await vector_store.upsert(
                    org_id=request.org_id,
                    vectors=vectors,
                    payloads=payloads,
                    ids=ids,
                )

                re_embedded += len(points)
                logger.debug(
                    "Migration: org=%s, doc=%s — %d chunks re-embedded",
                    request.org_id, doc_id, len(points),
                )

            except Exception as exc:
                errors += 1
                logger.error(
                    "Migration error: org=%s, doc=%s: %s",
                    request.org_id, doc_id, exc,
                )

        # ── 4. Return summary ─────────────────────────────────────────────
        status = "completed" if errors == 0 else "completed_with_errors"
        logger.info(
            "Migration done: org=%s, re_embedded=%d, errors=%d, status=%s",
            request.org_id, re_embedded, errors, status,
        )

        return ReEmbedOrgResponse(
            org_id=request.org_id,
            stale_chunks_found=len(stale_points),
            chunks_re_embedded=re_embedded,
            errors=errors,
            status=status,
        )


migration_service = MigrationService()
