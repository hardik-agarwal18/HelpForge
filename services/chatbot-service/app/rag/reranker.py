"""
LLM-Based Re-ranker
────────────────────
Sits between the retriever and the prompt builder.

Problem it solves:
  Vector similarity measures "semantic closeness to the query" — not "does this
  chunk actually answer the question?"  A chunk about "resetting your password"
  can be semantically close to "I forgot my username" while being unhelpful.

Approach (LLM-as-judge):
  1. Send query + top-K candidate excerpts to the LLM in a single call.
  2. Ask the LLM to emit a JSON array of relevance scores [0.0 – 1.0].
  3. Re-sort candidates by those scores, drop below-threshold ones.
  4. On any failure → gracefully fall back to original Qdrant ranking.

Cost:  1 extra LLM call per query, ~300–500 tokens.  Insignificant against
       the quality gain for auto-resolve decisions.
"""

import json
import logging
from typing import Any

from app.llm.gateway_client import gateway_client

logger = logging.getLogger(__name__)

_RERANK_SYSTEM = """\
You are a relevance scoring system for a customer support knowledge base.

Given a QUERY and a numbered list of DOCUMENT EXCERPTS, output a JSON array
of floating-point relevance scores in the SAME ORDER as the documents.

Scoring guide:
  0.9 – 1.0  Directly answers the query
  0.7 – 0.8  Closely related, useful supporting context
  0.4 – 0.6  Loosely related
  0.0 – 0.3  Not relevant

Rules:
- Respond with ONLY valid JSON, e.g. [0.9, 0.3, 0.7, 0.1, 0.8]
- No explanation, no markdown, no extra text
- Array length MUST equal the number of documents provided
"""

_MAX_CANDIDATES = 8      # Never send more than this — controls token cost
_MIN_RERANK_SCORE = 0.35  # Drop docs below this score
_SKIP_RERANK_THRESHOLD = 0.90  # Skip LLM call if top doc already this confident


class Reranker:
    async def rerank(
        self,
        org_id: str,
        query: str,
        docs: list[dict[str, Any]],
        top_n: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Re-rank `docs` by LLM relevance and return the top `top_n`.
        Falls back to original order (sliced to top_n) on any error.
        """
        if not docs:
            return docs

        # Fast path: top document is already highly confident — LLM call unnecessary
        if docs[0].get("score", 0) >= _SKIP_RERANK_THRESHOLD:
            logger.debug(
                "Re-rank skipped: top_score=%.3f >= %.2f (org=%s)",
                docs[0]["score"], _SKIP_RERANK_THRESHOLD, org_id,
            )
            return docs[:top_n]

        candidates = docs[:_MAX_CANDIDATES]

        try:
            scores = await self._score_docs(org_id, query, candidates)
        except Exception as exc:
            logger.warning(
                "Re-ranker failed (org=%s), using original order: %s", org_id, exc
            )
            return candidates[:top_n]

        # Enrich with rerank_score and sort descending
        enriched = [
            {**doc, "rerank_score": score}
            for doc, score in zip(candidates, scores)
        ]
        enriched.sort(key=lambda d: d["rerank_score"], reverse=True)

        # Drop low-quality docs
        relevant = [d for d in enriched if d["rerank_score"] >= _MIN_RERANK_SCORE]

        logger.debug(
            "Re-rank: org=%s, %d candidates → %d relevant (top_n=%d)",
            org_id, len(candidates), len(relevant), top_n,
        )
        return relevant[:top_n]

    async def _score_docs(
        self,
        org_id: str,
        query: str,
        docs: list[dict[str, Any]],
    ) -> list[float]:
        """Ask the LLM to score each document's relevance to the query."""
        doc_block = "\n\n".join(
            f"[Doc {i + 1}]: {doc['payload'].get('text', '')[:350]}"
            for i, doc in enumerate(docs)
        )
        user_content = f"QUERY: {query}\n\nDOCUMENTS:\n{doc_block}"

        result = await gateway_client.generate(
            org_id=org_id,
            messages=[{"role": "user", "content": user_content}],
            system_prompt=_RERANK_SYSTEM,
        )

        raw = result.get("content", "[]").strip()

        # Strip accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        scores: list = json.loads(raw)

        if not isinstance(scores, list) or len(scores) != len(docs):
            raise ValueError(f"Unexpected reranker output shape: {scores!r}")

        return [max(0.0, min(1.0, float(s))) for s in scores]


reranker = Reranker()
