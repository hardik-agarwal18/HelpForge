"""
RAG Retriever
──────────────
Embeds the user query and searches the org's Qdrant collection for the most
relevant document chunks.
"""

import logging
from typing import Any, Optional

from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.vectorstore.qdrant_store import vector_store

logger = logging.getLogger(__name__)


class RAGRetriever:
    async def retrieve(
        self,
        org_id: str,
        query: str,
        top_k: int | None = None,
        filter_conditions: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """
        1. Embed the query (with caching).
        2. Search the org's Qdrant collection.
        3. Return top-K hits with score + payload.
        """
        top_k = top_k or settings.top_k_retrieval

        query_vector = await embedder.embed_one(org_id, query)

        results = await vector_store.search(
            org_id=org_id,
            query_vector=query_vector,
            top_k=top_k,
            filter_conditions=filter_conditions,
        )

        logger.debug(
            "Retrieval: org=%s, query_len=%d, hits=%d, top_score=%.3f",
            org_id,
            len(query),
            len(results),
            results[0]["score"] if results else 0,
        )
        return results


retriever = RAGRetriever()
