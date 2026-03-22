"""
Tool: assign_agent
───────────────────
Assigns a support ticket to a specific human agent via the API Gateway.

Used in:
  • AUTOMATION mode — smart assignment when AI confidence is medium-high
  • AUGMENTATION mode — agent suggests reassignment to a specialist
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolExecutionError

logger = logging.getLogger(__name__)


class _Input(BaseModel):
    ticket_id: str = Field(min_length=1)
    org_id: str = Field(min_length=1)
    agent_id: str = Field(min_length=1)
    reason: Optional[str] = Field(default="", max_length=300)


class AssignAgentTool(BaseTool):
    name = "assign_agent"
    description = "Assign a support ticket to a specific human agent"
    input_fields = [
        ("ticket_id", "str", "ID of the ticket to assign"),
        ("org_id", "str", "Organisation ID"),
        ("agent_id", "str", "ID of the agent to assign the ticket to"),
        ("reason", "str?", "Short reason for the assignment (max 300 chars)"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        try:
            result = await action_gateway.assign_agent(
                ticket_id=inp.ticket_id,
                org_id=inp.org_id,
                agent_id=inp.agent_id,
                reason=inp.reason or "",
            )
            logger.info(
                "assign_agent: org=%s ticket=%s agent=%s",
                inp.org_id, inp.ticket_id, inp.agent_id,
            )
            return {
                "success": True,
                "ticket_id": inp.ticket_id,
                "assigned_to": inp.agent_id,
                "result": result,
            }
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
