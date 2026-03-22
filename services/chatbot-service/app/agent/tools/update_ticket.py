"""
Tool: update_ticket
────────────────────
Updates an existing ticket's metadata via the API Gateway internal agent endpoint.

Used when the agent decides a ticket's status, priority, or tags should change —
e.g. marking a ticket RESOLVED after providing a high-confidence answer, or
downgrading priority after diagnosing a non-urgent issue.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolCost, ToolExecutionError

logger = logging.getLogger(__name__)

_VALID_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ON_HOLD"}
_VALID_PRIORITIES = {"LOW", "MEDIUM", "HIGH", "URGENT"}


class _Input(BaseModel):
    ticket_id: str = Field(min_length=1)
    org_id: str = Field(min_length=1)
    status: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.upper()
            if v not in _VALID_STATUSES:
                raise ValueError(f"status must be one of {_VALID_STATUSES}")
        return v

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.upper()
            if v not in _VALID_PRIORITIES:
                raise ValueError(f"priority must be one of {_VALID_PRIORITIES}")
        return v


class UpdateTicketTool(BaseTool):
    name = "update_ticket"
    description = "Update an existing ticket's status, priority, tags, or category"
    cost = ToolCost.LOW  # Simple DB write, no LLM
    input_fields = [
        ("ticket_id", "str", "ID of the ticket to update"),
        ("org_id", "str", "Organisation ID"),
        ("status", "str?", "OPEN | IN_PROGRESS | RESOLVED | CLOSED | ON_HOLD"),
        ("priority", "str?", "LOW | MEDIUM | HIGH | URGENT"),
        ("tags", "list[str]?", "Replacement tag list"),
        ("category", "str?", "New category string"),
        ("note", "str?", "Internal agent note added to update (max 500 chars)"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        # Build only the fields that were actually provided
        updates: Dict[str, Any] = {}
        if inp.status is not None:
            updates["status"] = inp.status
        if inp.priority is not None:
            updates["priority"] = inp.priority
        if inp.tags is not None:
            updates["tags"] = inp.tags
        if inp.category is not None:
            updates["category"] = inp.category
        if inp.note is not None:
            updates["agentNote"] = inp.note

        if not updates:
            raise ToolExecutionError(self.name, "No update fields provided", retriable=False)

        try:
            result = await action_gateway.update_ticket(
                ticket_id=inp.ticket_id,
                org_id=inp.org_id,
                updates=updates,
            )
            logger.info(
                "update_ticket: org=%s ticket=%s updates=%s",
                inp.org_id, inp.ticket_id, list(updates.keys()),
            )
            return {"success": True, "ticket_id": inp.ticket_id, "updated_fields": list(updates.keys()), "ticket": result}
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
