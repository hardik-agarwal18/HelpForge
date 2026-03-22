"""
Tool: classify_ticket
──────────────────────
Runs the API Gateway's ticket classification routine — assigns a category,
sub-category, and severity to a ticket using the LLM.

Used in automation mode when a new ticket arrives with little context —
classification enables better routing and priority assignment.
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


class ClassifyTicketTool(BaseTool):
    name = "classify_ticket"
    description = "Classify a ticket's category, sub-category, and severity using AI"
    cost = ToolCost.HIGH  # Full LLM classification call
    input_fields = [
        ("ticket_id", "str", "ID of the ticket to classify"),
        ("org_id", "str", "Organisation ID"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        try:
            result = await action_gateway.classify_ticket(
                ticket_id=inp.ticket_id,
                org_id=inp.org_id,
            )
            logger.info(
                "classify_ticket: org=%s ticket=%s category=%s",
                inp.org_id, inp.ticket_id, result.get("category"),
            )
            return {
                "success": True,
                "ticket_id": inp.ticket_id,
                "category": result.get("category"),
                "sub_category": result.get("subCategory"),
                "severity": result.get("severity"),
                "classification": result,
            }
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
