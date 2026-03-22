"""
Tool: escalate_ticket
──────────────────────
Flags a ticket for immediate escalation to a senior support agent or team.

Distinct from the ESCALATE action in AgentDecision:
  • AgentDecision.action=ESCALATE is the agent deciding NOT to respond
  • This tool actively triggers an escalation workflow in the system
    (e.g. sends notifications, changes ticket priority, flags the queue)

Used when:
  • The issue is beyond the AI's scope
  • SLA is at risk
  • Multiple failed resolution attempts detected
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import BaseModel, Field, field_validator

from app.agent.gateway import action_gateway
from app.agent.tools.base import BaseTool, ToolCost, ToolExecutionError

logger = logging.getLogger(__name__)

_VALID_URGENCY = {"LOW", "NORMAL", "HIGH", "CRITICAL"}


class _Input(BaseModel):
    ticket_id: str = Field(min_length=1)
    org_id: str = Field(min_length=1)
    reason: str = Field(min_length=5, max_length=500)
    urgency: str = Field(default="NORMAL")

    @field_validator("urgency")
    @classmethod
    def _validate_urgency(cls, v: str) -> str:
        v = v.upper()
        if v not in _VALID_URGENCY:
            raise ValueError(f"urgency must be one of {_VALID_URGENCY}")
        return v


class EscalateTicketTool(BaseTool):
    name = "escalate_ticket"
    description = "Escalate a ticket to senior support with a reason and urgency level"
    cost = ToolCost.MEDIUM  # Triggers notifications + priority changes
    input_fields = [
        ("ticket_id", "str", "ID of the ticket to escalate"),
        ("org_id", "str", "Organisation ID"),
        ("reason", "str", "Explanation of why escalation is needed (5–500 chars)"),
        ("urgency", "str", "LOW | NORMAL | HIGH | CRITICAL (default NORMAL)"),
    ]

    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            inp = _Input(**input_data)
        except Exception as exc:
            raise ToolExecutionError(self.name, f"Invalid input: {exc}", retriable=False) from exc

        try:
            result = await action_gateway.escalate_ticket(
                ticket_id=inp.ticket_id,
                org_id=inp.org_id,
                reason=inp.reason,
                urgency=inp.urgency,
            )
            logger.info(
                "escalate_ticket: org=%s ticket=%s urgency=%s",
                inp.org_id, inp.ticket_id, inp.urgency,
            )
            return {
                "success": True,
                "ticket_id": inp.ticket_id,
                "urgency": inp.urgency,
                "result": result,
            }
        except Exception as exc:
            raise ToolExecutionError(self.name, str(exc), retriable=True) from exc
