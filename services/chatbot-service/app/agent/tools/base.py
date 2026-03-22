"""
Base Tool
──────────
Abstract base class for every agent tool.

Contract:
  • Each subclass sets `name`, `description`, and `input_fields` at class level.
  • `execute()` receives a raw dict, must validate it, and return a result dict.
  • On failure, raise ToolExecutionError — never let raw exceptions propagate.
  • `to_prompt_description()` renders a one-liner for system prompt injection.
  • `to_schema_description()` renders a full schema block for the LLM.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Tuple


class ToolExecutionError(Exception):
    """
    Raised by any tool when execution fails.

    Attributes:
      tool       — name of the failing tool
      reason     — human-readable failure reason (safe to log)
      retriable  — True if a retry might succeed (transient errors)
    """

    def __init__(
        self,
        tool: str,
        reason: str,
        retriable: bool = False,
    ) -> None:
        super().__init__(f"[{tool}] {reason}")
        self.tool = tool
        self.reason = reason
        self.retriable = retriable


class BaseTool(ABC):
    """
    Abstract base for all agent tools.

    Class-level attributes (must be set by subclasses):
      name         — unique snake_case tool identifier
      description  — one sentence explaining what the tool does
      input_fields — list of (field_name, type_hint, description) tuples
    """

    name: str
    description: str

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

    def to_prompt_description(self) -> str:
        """
        One-line description injected into the system prompt tool list.
        e.g.  - create_ticket(subject, description, priority): Create a new ticket
        """
        params = ", ".join(f[0] for f in self.input_fields)
        return f"- {self.name}({params}): {self.description}"

    def to_schema_description(self) -> str:
        """
        Multi-line detailed schema block for in-context tool documentation.
        """
        lines = [
            f"Tool: {self.name}",
            f"Description: {self.description}",
            "Input fields:",
        ]
        for field_name, type_hint, desc in self.input_fields:
            lines.append(f"  - {field_name} ({type_hint}): {desc}")
        return "\n".join(lines)
