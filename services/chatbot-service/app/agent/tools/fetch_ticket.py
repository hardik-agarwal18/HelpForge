"""
Tool: fetch_ticket
───────────────────
Retrieves full ticket details (metadata + comments) via the API Gateway.

Used when the agent needs to inspect ticket context it wasn't already given —
e.g. in automation mode where only the comment event arrives but the full
ticket history is needed for a confident decision.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import BaseModel, Field

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolExecutionError

logger = logging.getLogger(__name__)


class _Input(BaseModel):
    ticket_id: str = Field(min_length=1)
    org_id: str = Field(min_length=1)


class FetchTicketTool(BaseTool):
    name = "fetch_ticket"
    description = "Retrieve full ticket details including all comments and metadata"
    input_fields = [
        ("ticket_id", "str", "ID of the ticket to fetch"),
        ("org_id", "str", "Organisation ID (for tenancy isolation)"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        try:
            ticket = await action_gateway.fetch_ticket(
                ticket_id=inp.ticket_id,
                org_id=inp.org_id,
            )
            logger.info(
                "fetch_ticket: org=%s ticket=%s comments=%d",
                inp.org_id,
                inp.ticket_id,
                len(ticket.get("comments", [])),
            )
            return {"success": True, "ticket": ticket}
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
