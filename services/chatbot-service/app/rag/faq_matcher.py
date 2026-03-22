"""
FAQ Matcher  (embedding-only, no LLM)
──────────────────────────────────────
Before the full RAG pipeline runs, check whether the user's query matches
a pre-indexed FAQ entry closely enough to return the stored answer directly.

Flow:
  1. Embed the query (Redis-cached → usually free)
  2. Dense search in Qdrant filtered to source_type = "faq"
  3. If top score ≥ settings.faq_similarity_threshold → short-circuit

Why this saves cost:
  - No LLM call (saves ~500–2 000 tokens per hit)
  - No re-ranker call
  - Embedding is cached → usually 0 extra cost after first query

Threshold guidance:
  0.95+ — extremely tight (only exact/near-exact phrasings match)
  0.92   — recommended default (same question, different wording)
  0.88   — looser (same topic, may pick up false positives)
"""

import logging
from dataclasses import dataclass

from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.vectorstore.qdrant_store import vector_store

logger = logging.getLogger(__name__)


@dataclass
class FAQMatch:
    matched: bool
    answer: str
    question: str   # the original FAQ question that matched
    score: float
    faq_id: str


class FAQMatcher:
    async def match(self, org_id: str, query: str) -> FAQMatch:
        """
        Return a FAQMatch.  matched=True only when a stored FAQ question
        has cosine similarity ≥ settings.faq_similarity_threshold.
        """
        # 1. Embed query (hits Redis cache if same text was seen before)
        try:
            vector = await embedder.embed_one(org_id, query)
        except Exception as exc:
            logger.warning("FAQ matcher: embedding failed (non-fatal): %s", exc)
            return FAQMatch(matched=False, answer="", question="", score=0.0, faq_id="")

        # 2. Search only FAQ-tagged vectors
        try:
            hits = await vector_store.search(
                org_id=org_id,
                query_vector=vector,
                top_k=1,
                filter_conditions={"source_type": "faq"},
            )
        except Exception as exc:
            logger.warning("FAQ matcher: Qdrant search failed (non-fatal): %s", exc)
            return FAQMatch(matched=False, answer="", question="", score=0.0, faq_id="")

        if not hits:
            return FAQMatch(matched=False, answer="", question="", score=0.0, faq_id="")

        top = hits[0]
        score = top["score"]

        if score < settings.faq_similarity_threshold:
            logger.debug(
                "FAQ miss: org=%s, score=%.4f < threshold=%.4f",
                org_id, score, settings.faq_similarity_threshold,
            )
            return FAQMatch(matched=False, answer="", question="", score=score, faq_id="")

        payload = top["payload"]
        logger.info(
            "FAQ hit: org=%s, score=%.4f, faq_id=%s",
            org_id, score, top["id"],
        )
        return FAQMatch(
            matched=True,
            answer=payload.get("answer", ""),
            question=payload.get("question", ""),
            score=score,
            faq_id=top["id"],
        )


faq_matcher = FAQMatcher()
