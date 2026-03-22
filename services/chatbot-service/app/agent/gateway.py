"""
Tool Action Gateway Client
───────────────────────────
HTTP client used exclusively by agent tools to call API Gateway action
endpoints.  This is separate from the LLM gateway client (llm/gateway_client.py)
which handles generate/embeddings — this one handles ticket and search actions.

All requests carry X-Internal-Token + X-Service-Id for service identity.
The API Gateway must expose /api/ai/internal/agent/* to accept these calls.

Expected Gateway endpoints (to be implemented on the Node.js side):
  POST   /api/ai/internal/agent/tickets                  → create ticket
  PUT    /api/ai/internal/agent/tickets/:id              → update ticket
  GET    /api/ai/internal/agent/tickets/:id              → fetch ticket
  POST   /api/ai/internal/agent/tickets/:id/assign       → assign agent
  POST   /api/ai/internal/agent/tickets/:id/escalate     → escalate
  POST   /api/ai/internal/agent/tickets/:id/summarize    → summarize
  POST   /api/ai/internal/agent/tickets/:id/classify     → classify
  POST   /api/ai/internal/agent/search                   → search knowledge base
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from app.config.settings import settings
from app.middleware.request_id import request_id_var

logger = logging.getLogger(__name__)

_SERVICE_ID = "chatbot-agent"

_ACTION_HEADERS = {
    "X-Internal-Token": settings.internal_service_token,
    "X-Service-Id": _SERVICE_ID,
    "Content-Type": "application/json",
}

_BASE = "/api/ai/internal/agent"


def _req_headers() -> Dict[str, str]:
    """Attach request-id for cross-service trace correlation."""
    req_id = request_id_var.get("")
    return {"X-Request-ID": req_id} if req_id else {}


class ActionGatewayClient:
    """
    Async HTTP client for agent tool → API Gateway action calls.

    Raises httpx.HTTPStatusError on non-2xx responses — callers (tools)
    are responsible for converting these to ToolExecutionError.
    """

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=settings.api_gateway_url,
                headers=_ACTION_HEADERS,
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=15.0,
                    write=10.0,
                    pool=5.0,
                ),
            )
        return self._client

    async def _call(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        resp = await self.client.request(
            method,
            path,
            json=json,
            params=params,
            headers=_req_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    # ── Ticket operations ──────────────────────────────────────────────────

    async def create_ticket(
        self,
        org_id: str,
        subject: str,
        description: str,
        priority: str = "MEDIUM",
        category: str = "General",
    ) -> Dict[str, Any]:
        return await self._call(
            "POST",
            f"{_BASE}/tickets",
            json={
                "orgId": org_id,
                "subject": subject,
                "description": description,
                "priority": priority,
                "category": category,
            },
        )

    async def update_ticket(
        self,
        ticket_id: str,
        org_id: str,
        updates: Dict[str, Any],
    ) -> Dict[str, Any]:
        return await self._call(
            "PUT",
            f"{_BASE}/tickets/{ticket_id}",
            json={"orgId": org_id, **updates},
        )

    async def fetch_ticket(
        self,
        ticket_id: str,
        org_id: str,
    ) -> Dict[str, Any]:
        return await self._call(
            "GET",
            f"{_BASE}/tickets/{ticket_id}",
            params={"orgId": org_id},
        )

    async def assign_agent(
        self,
        ticket_id: str,
        org_id: str,
        agent_id: str,
        reason: str = "",
    ) -> Dict[str, Any]:
        return await self._call(
            "POST",
            f"{_BASE}/tickets/{ticket_id}/assign",
            json={"orgId": org_id, "agentId": agent_id, "reason": reason},
        )

    async def escalate_ticket(
        self,
        ticket_id: str,
        org_id: str,
        reason: str,
        urgency: str = "NORMAL",
    ) -> Dict[str, Any]:
        return await self._call(
            "POST",
            f"{_BASE}/tickets/{ticket_id}/escalate",
            json={"orgId": org_id, "reason": reason, "urgency": urgency},
        )

    async def summarize_ticket(
        self,
        ticket_id: str,
        org_id: str,
    ) -> Dict[str, Any]:
        return await self._call(
            "POST",
            f"{_BASE}/tickets/{ticket_id}/summarize",
            json={"orgId": org_id},
        )

    async def classify_ticket(
        self,
        ticket_id: str,
        org_id: str,
    ) -> Dict[str, Any]:
        return await self._call(
            "POST",
            f"{_BASE}/tickets/{ticket_id}/classify",
            json={"orgId": org_id},
        )

    async def search_docs(
        self,
        org_id: str,
        query: str,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        return await self._call(
            "POST",
            f"{_BASE}/search",
            json={"orgId": org_id, "query": query, "topK": top_k},
        )

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("ActionGatewayClient connection pool closed")


# Module-level singleton shared by all tools
action_gateway = ActionGatewayClient()
