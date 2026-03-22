"""
Agent Validator
────────────────
Validates the JSON decision returned by the LLM before it enters the execution
pipeline.  Two levels of validation:

  Level 1 — Schema  : Ensure required fields are present and have correct types.
  Level 2 — Semantic: Ensure TOOL_CALL decisions name a registered tool.

Why separate from Pydantic model validation?
  The LLM output is untrusted raw text.  Pydantic validates *after* JSON
  extraction, but we need targeted, debug-friendly error messages here rather
  than Pydantic's generic validation errors.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)

# ── Required field definitions ────────────────────────────────────────────────

_REQUIRED_FIELDS: Dict[str, type] = {
    "action": str,
    "confidence": (int, float),
    "reasoning": str,
    "message": str,
}

_VALID_ACTIONS = {"respond", "tool_call", "escalate", "suggest"}
_CONFIDENCE_RANGE = (0.0, 1.0)


class ValidationError(Exception):
    """Raised when the LLM decision fails validation."""
    pass


class AgentValidator:
    """
    Validates raw LLM decision dicts before they enter the execution pipeline.

    Three tiers of tool name checks:
      _all_tool_names    — every registered tool (existence check)
      _active_tool_names — tools that are ACTIVE or DEGRADED (availability check)

    If the LLM tries to call a DISABLED tool the validator rejects it with a
    clear message, causing the agent to return a safe fallback rather than
    attempting to execute a broken tool.
    """

    def __init__(self, registered_tool_names: Optional[Set[str]] = None) -> None:
        self._all_tool_names: Set[str] = registered_tool_names or set()
        self._active_tool_names: Set[str] = registered_tool_names or set()

    def update_tool_names(self, names: Set[str]) -> None:
        """Called by executor after building the registry (full set)."""
        self._all_tool_names = names

    def update_active_tools(self, names: Set[str]) -> None:
        """
        Called by executor whenever tool statuses change.
        `names` should contain ACTIVE + DEGRADED tools only (not DISABLED).
        """
        self._active_tool_names = names

    def validate(self, data: Dict[str, Any], mode: str) -> None:
        """
        Validate a raw decision dict.

        Raises:
            ValidationError with a descriptive message if anything is wrong.
        """
        # ── Level 1: Required fields ───────────────────────────────────────
        for field, expected_type in _REQUIRED_FIELDS.items():
            if field not in data:
                raise ValidationError(f"Missing required field: '{field}'")
            if not isinstance(data[field], expected_type):
                raise ValidationError(
                    f"Field '{field}' has wrong type: "
                    f"expected {expected_type}, got {type(data[field]).__name__}"
                )

        # ── Level 2: Field values ──────────────────────────────────────────
        action = data["action"]
        if action not in _VALID_ACTIONS:
            raise ValidationError(
                f"Invalid action '{action}'; must be one of {_VALID_ACTIONS}"
            )

        confidence = float(data["confidence"])
        if not (_CONFIDENCE_RANGE[0] <= confidence <= _CONFIDENCE_RANGE[1]):
            raise ValidationError(
                f"confidence {confidence} out of range [0.0, 1.0]"
            )

        # ── Level 3: TOOL_CALL semantics ──────────────────────────────────
        if action == "tool_call":
            tool = data.get("tool")
            if not tool or not isinstance(tool, str):
                raise ValidationError("action=tool_call requires a non-empty 'tool' string")

            # 3a: tool must be registered
            if self._all_tool_names and tool not in self._all_tool_names:
                raise ValidationError(
                    f"Unknown tool '{tool}'; registered: {sorted(self._all_tool_names)}"
                )

            # 3b: tool must not be DISABLED
            if self._active_tool_names and tool not in self._active_tool_names:
                raise ValidationError(
                    f"Tool '{tool}' is currently DISABLED — "
                    f"choose an active tool from: {sorted(self._active_tool_names)}"
                )

            tool_input = data.get("tool_input", {})
            if not isinstance(tool_input, dict):
                raise ValidationError("'tool_input' must be a JSON object (dict)")

        # ── Level 4: Message non-empty ────────────────────────────────────
        if not data["message"].strip():
            raise ValidationError("'message' must not be empty")

        logger.debug(
            "Decision validated: mode=%s action=%s confidence=%.3f",
            mode, action, confidence,
        )


# Module-level singleton — executor populates both name sets at startup and
# calls update_active_tools() any time a status changes at runtime.
agent_validator = AgentValidator()
