"""
Hybrid RAG Retriever
─────────────────────
Two-path retrieval merged via Reciprocal Rank Fusion (RRF).

  Path A — Dense (semantic):
    Embed query → cosine search in Qdrant
    Captures meaning, synonyms, paraphrases

  Path B — Keyword (lexical):
    Extract significant terms from the query → MatchText filter + vector search
    Captures exact matches: error codes, product names, IDs, version numbers

  Merge — Reciprocal Rank Fusion:
    score(doc, rank) = 1 / (k + rank)   where k=60 is a smoothing constant
    Sum across all lists → stable cross-list ranking without score normalisation

Why RRF over simple score averaging?
  • Retrieval scores from different paths are not on the same scale
  • RRF is order-based, not magnitude-based — immune to score distribution shift
  • Well-established in TREC hybrid search literature

Re-ranking is NOT done here — that's the pipeline's responsibility after this call.
"""

import logging
import re
from typing import Any, Optional

from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.vectorstore.qdrant_store import vector_store

logger = logging.getLogger(__name__)

# Words to strip when extracting keywords (English stop words, minimal set)
_STOP_WORDS = frozenset(
    "a an the is are was were be been being have has had do does did "
    "will would shall should may might must can could not no nor so "
    "and or but if then than because as until while of at by for with "
    "about against between into through during before after above below "
    "to from up down in out on off over under again further that this "
    "i you he she it we they what which who whom when where why how "
    "me my myself your yourself his him her itself us our ours them "
    "their theirs itself itself all each every few more most other "
    "some such only own same than too very s t just don don't"
    .split()
)

_RRF_K = 60  # Standard RRF smoothing constant


class RAGRetriever:
    # ── Public interface ──────────────────────────────────────────────────

    async def retrieve(
        self,
        org_id: str,
        query: str,
        top_k: int | None = None,
        filter_conditions: Optional[dict[str, Any]] = None,
        page_url: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Hybrid retrieval: dense + keyword + (optional) URL-boosted path → RRF merge.

        page_url (optional):
            When provided, a third retrieval path is run filtered to vectors
            whose `url` payload matches exactly.  Results from that path receive
            an additional RRF pass-through, effectively boosting page-local
            content to the top when the query relates to the page the user is on.

            Example: user on /pricing asks "how much does the Pro plan cost?"
            → RRF naturally prefers pricing-page chunks over generic FAQ chunks.
        """
        top_k = top_k or settings.top_k_retrieval
        candidate_k = top_k * 2

        # Embed once — reused by all paths
        query_vector = await embedder.embed_one(org_id, query)

        # Path A: dense semantic search (global)
        dense_results = await vector_store.search(
            org_id=org_id,
            query_vector=query_vector,
            top_k=candidate_k,
            filter_conditions=filter_conditions,
        )

        # Path B: keyword-filtered vector search
        keywords = self._extract_keywords(query)
        keyword_results: list[dict[str, Any]] = []
        if keywords:
            keyword_results = await vector_store.keyword_search(
                org_id=org_id,
                query_vector=query_vector,
                keywords=keywords,
                top_k=candidate_k,
            )

        # Path C (optional): URL-scoped dense search for page-aware boost
        url_results: list[dict[str, Any]] = []
        if page_url:
            try:
                url_results = await vector_store.search(
                    org_id=org_id,
                    query_vector=query_vector,
                    top_k=candidate_k,
                    filter_conditions={"url": page_url},
                )
            except Exception as exc:
                logger.debug("URL-boosted retrieval failed (non-fatal): %s", exc)

        # Merge — include URL path twice to give it an RRF boost
        result_lists = [dense_results]
        if keyword_results:
            result_lists.append(keyword_results)
        if url_results:
            # Double-weight: appear in two separate lists so RRF score is additive
            result_lists.append(url_results)
            result_lists.append(url_results)

        if len(result_lists) > 1:
            merged = self._rrf_merge(result_lists)
            logger.debug(
                "Hybrid retrieval: org=%s, dense=%d, keyword=%d, url=%d, merged=%d",
                org_id, len(dense_results), len(keyword_results), len(url_results), len(merged),
            )
        else:
            merged = dense_results
            logger.debug("Dense-only retrieval: org=%s, hits=%d", org_id, len(merged))

        return merged[:top_k]

    # ── Keyword extraction ─────────────────────────────────────────────────

    def _extract_keywords(self, query: str, max_keywords: int = 5) -> list[str]:
        """
        Extract meaningful tokens from the query for the keyword search path.
        Simple heuristic: tokens ≥4 chars, not stop words, alphabetic or numeric.
        """
        tokens = re.findall(r"\b[\w\-\.]+\b", query.lower())
        keywords = [
            t for t in tokens
            if t not in _STOP_WORDS
            and len(t) >= 3
            and not t.isdigit()
        ]
        # Deduplicate while preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique.append(kw)

        return unique[:max_keywords]

    # ── Reciprocal Rank Fusion ─────────────────────────────────────────────

    @staticmethod
    def _rrf_merge(result_lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        """
        Merge multiple ranked result lists using Reciprocal Rank Fusion.
        The doc with the highest combined RRF score appears first.
        """
        rrf_scores: dict[str, dict[str, Any]] = {}

        for results in result_lists:
            for rank, doc in enumerate(results):
                doc_id = doc["id"]
                if doc_id not in rrf_scores:
                    rrf_scores[doc_id] = {"rrf_score": 0.0, "doc": doc}
                rrf_scores[doc_id]["rrf_score"] += 1.0 / (_RRF_K + rank)

        sorted_docs = sorted(
            rrf_scores.values(),
            key=lambda x: x["rrf_score"],
            reverse=True,
        )
        return [entry["doc"] for entry in sorted_docs]


retriever = RAGRetriever()
