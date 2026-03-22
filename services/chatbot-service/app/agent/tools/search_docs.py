"""
Tool: search_docs
──────────────────
Performs a knowledge-base search via the API Gateway, which internally
calls the chatbot-service's RAG retriever + re-ranker pipeline.

Used when the agent needs fresh document context that wasn't included in
the initial RAG pass — e.g. the user asks a follow-up question that differs
significantly from the original query used for retrieval.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from pydantic import BaseModel, Field

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolCost, ToolExecutionError

logger = logging.getLogger(__name__)

_MAX_TOP_K = 10


class _Input(BaseModel):
    org_id: str = Field(min_length=1)
    query: str = Field(min_length=3, max_length=500)
    top_k: int = Field(default=5, ge=1, le=_MAX_TOP_K)


class SearchDocsTool(BaseTool):
    name = "search_docs"
    description = "Search the organisation's knowledge base for relevant documents"
    cost = ToolCost.MEDIUM  # Embedding call + Qdrant search
    input_fields = [
        ("org_id", "str", "Organisation ID (scopes the search to org's collection)"),
        ("query", "str", "Search query — 3 to 500 chars"),
        ("top_k", "int", "Number of results to return (1–10, default 5)"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        try:
            result = await action_gateway.search_docs(
                org_id=inp.org_id,
                query=inp.query,
                top_k=inp.top_k,
            )
            docs: List[Dict[str, Any]] = result.get("results", [])
            logger.info(
                "search_docs: org=%s query=%r results=%d",
                inp.org_id, inp.query[:60], len(docs),
            )
            return {
                "success": True,
                "query": inp.query,
                "result_count": len(docs),
                "results": docs,
                # Condensed context string — ready to inject into a follow-up prompt
                "context": "\n\n".join(
                    f"[Doc {i+1}] {d.get('excerpt', d.get('text', ''))[:400]}"
                    for i, d in enumerate(docs)
                ),
            }
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
