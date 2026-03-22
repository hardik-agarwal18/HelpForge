"""
Tool: create_ticket
────────────────────
Creates a new support ticket via the API Gateway internal agent endpoint.

Used when the agent decides a new ticket should be opened — e.g. when a user
describes a new, distinct problem during an existing conversation.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import BaseModel, Field, field_validator

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolExecutionError

logger = logging.getLogger(__name__)

_VALID_PRIORITIES = {"LOW", "MEDIUM", "HIGH", "URGENT"}


class _Input(BaseModel):
    org_id: str = Field(min_length=1)
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    priority: str = Field(default="MEDIUM")
    category: str = Field(default="General", max_length=100)

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v: str) -> str:
        v = v.upper()
        if v not in _VALID_PRIORITIES:
            raise ValueError(f"priority must be one of {_VALID_PRIORITIES}")
        return v


class CreateTicketTool(BaseTool):
    name = "create_ticket"
    description = "Create a new support ticket on behalf of a user"
    input_fields = [
        ("org_id", "str", "Organisation ID (required)"),
        ("subject", "str", "Ticket subject — max 200 chars"),
        ("description", "str", "Detailed problem description — max 2000 chars"),
        ("priority", "str", "LOW | MEDIUM | HIGH | URGENT (default MEDIUM)"),
        ("category", "str", "Ticket category (default General)"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        # Validate
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        # Call Gateway
        try:
            result = await action_gateway.create_ticket(
                org_id=inp.org_id,
                subject=inp.subject,
                description=inp.description,
                priority=inp.priority,
                category=inp.category,
            )
            logger.info(
                "create_ticket: org=%s ticket_id=%s",
                inp.org_id, result.get("id"),
            )
            return {
                "success": True,
                "ticket_id": result.get("id"),
                "ticket": result,
            }
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
