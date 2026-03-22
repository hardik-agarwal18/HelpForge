"""
Tool: summarize_ticket
───────────────────────
Generates a concise summary of a ticket's conversation history via the
API Gateway.  The Node.js side calls the LLM to produce the summary.

Used in:
  • AUGMENTATION mode — give a human agent a quick brief before they respond
  • AUTOMATION mode — when the AI needs to understand a long conversation thread
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import BaseModel, Field

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolCost, ToolExecutionError

logger = logging.getLogger(__name__)


class _Input(BaseModel):
    ticket_id: str = Field(min_length=1)
    org_id: str = Field(min_length=1)


class SummarizeTicketTool(BaseTool):
    name = "summarize_ticket"
    description = "Generate a concise summary of a ticket's full conversation history"
    cost = ToolCost.HIGH  # Full LLM call over entire ticket history
    input_fields = [
        ("ticket_id", "str", "ID of the ticket to summarize"),
        ("org_id", "str", "Organisation ID"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        try:
            result = await action_gateway.summarize_ticket(
                ticket_id=inp.ticket_id,
                org_id=inp.org_id,
            )
            summary: str = result.get("summary", "")
            logger.info(
                "summarize_ticket: org=%s ticket=%s summary_len=%d",
                inp.org_id, inp.ticket_id, len(summary),
            )
            return {
                "success": True,
                "ticket_id": inp.ticket_id,
                "summary": summary,
            }
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
