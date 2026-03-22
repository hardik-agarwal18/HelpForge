"""
Base Tool
──────────
Abstract base class for every agent tool.

Contract:
  • Each subclass sets `name`, `description`, `cost`, and `input_fields`.
  • `execute()` receives a raw dict, validates it, and returns a result dict.
  • On failure, raise ToolExecutionError — never let raw exceptions propagate.
  • `to_prompt_description()` renders status + cost tags for prompt injection.
  • `to_schema_description()` renders a full schema block for the LLM.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, List, Tuple


class ToolExecutionError(Exception):
    """
    Raised by any tool when execution fails.

    Attributes:
      tool       — name of the failing tool
      reason     — human-readable failure reason (safe to log)
      retriable  — True if a retry might succeed (transient errors)
    """

    def __init__(self, tool: str, reason: str, retriable: bool = False) -> None:
        super().__init__(f"[{tool}] {reason}")
        self.tool = tool
        self.reason = reason
        self.retriable = retriable


class ToolCost(str, Enum):
    """
    Relative cost tier for each tool — injected into the LLM prompt so the
    agent can prefer cheaper tools when multiple options would work equally well.

      LOW    — simple DB read/write, no LLM, sub-millisecond operations
      MEDIUM — lightweight LLM call, embedding, or notification triggers
      HIGH   — full LLM call over large context (summarize, classify)
    """
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class BaseTool(ABC):
    """
    Abstract base for all agent tools.

    Class-level attributes (must be set by subclasses):
      name         — unique snake_case tool identifier
      description  — one sentence explaining what the tool does
      cost         — ToolCost tier (default MEDIUM)
      input_fields — list of (field_name, type_hint, description) tuples
    """

    name: str
    description: str
    cost: ToolCost = ToolCost.MEDIUM

    # List of (field_name, type_hint, description) — used for prompt rendering
    input_fields: List[Tuple[str, str, str]] = []

    @abstractmethod
    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the tool with the provided input.

        Implementations must:
          1. Validate input_data (raise ToolExecutionError on bad input)
          2. Call the API Gateway action endpoint
          3. Return a plain dict describing the outcome
          4. Catch all exceptions and wrap them as ToolExecutionError
        """
        ...

    # ── Prompt rendering ──────────────────────────────────────────────────

    def to_prompt_description(self, status: str = "ACTIVE") -> str:
        """
        One-line description injected into the system prompt tool list.

        Format:
          - create_ticket(subject, ...): Create a new ticket  [✓ ACTIVE] [cost:MEDIUM]
          - assign_agent(ticket_id, ...): Assign ticket  [✗ DISABLED] [cost:LOW]

        The executor passes the runtime status so the LLM knows which tools
        are currently available — preventing calls to disabled/degraded tools.
        """
        params = ", ".join(f[0] for f in self.input_fields)
        if status == "ACTIVE":
            status_tag = "✓ ACTIVE"
        elif status == "DEGRADED":
            status_tag = "⚠ DEGRADED"
        else:
            status_tag = "✗ DISABLED"
        return (
            f"- {self.name}({params}): {self.description}"
            f"  [{status_tag}] [cost:{self.cost.value}]"
        )

    def to_schema_description(self) -> str:
        """Multi-line detailed schema block for in-context tool documentation."""
        lines = [
            f"Tool: {self.name}",
            f"Description: {self.description}",
            f"Cost: {self.cost.value}",
            "Input fields:",
        ]
        for field_name, type_hint, desc in self.input_fields:
            lines.append(f"  - {field_name} ({type_hint}): {desc}")
        return "\n".join(lines)
