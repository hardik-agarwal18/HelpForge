"""
Agent Utilities
────────────────
Shared helpers used across the agent layer.

  • approx_tokens()        — rough token count without a tokenizer
  • truncate_to_tokens()   — hard-cut text to a token budget
  • extract_json()         — robust JSON extraction from LLM output
  • format_history()       — render conversation history as a readable string
  • build_fallback_decision_dict() — safe fallback when LLM output is unparseable
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# ── Token estimation ──────────────────────────────────────────────────────────

# GPT-4 averages ~4 chars per token; this is intentionally conservative.
_CHARS_PER_TOKEN = 4


def approx_tokens(text: str) -> int:
    """Return approximate token count for the given string."""
    return max(1, len(text) // _CHARS_PER_TOKEN)


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """
    Hard-truncate text so it fits within `max_tokens`.
    Appends a notice so the LLM knows context was cut.
    """
    limit = max_tokens * _CHARS_PER_TOKEN
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...[context truncated for token budget]"


# ── JSON extraction ───────────────────────────────────────────────────────────

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json(text: str) -> Dict[str, Any]:
    """
    Extract the first valid JSON object from LLM output.

    Handles three formats:
      1. Bare JSON response          {"action": "respond", ...}
      2. Markdown code block         ```json\n{"action": ...}\n```
      3. JSON embedded in prose      "Here is my decision: {...}"

    Raises ValueError if no valid JSON can be found.
    """
    # 1. Bare JSON
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        pass

    # 2. ```json ... ``` code block
    m = _JSON_BLOCK_RE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except (json.JSONDecodeError, ValueError):
            pass

    # 3. First balanced { ... } found in prose
    m = _JSON_OBJECT_RE.search(text)
    if m:
        try:
            return json.loads(m.group(0))
        except (json.JSONDecodeError, ValueError):
            pass

    raise ValueError(f"No valid JSON found in LLM output (first 300 chars): {text[:300]!r}")


# ── Decision fallback ─────────────────────────────────────────────────────────

def build_fallback_decision_dict(mode: str, reason: str) -> Dict[str, Any]:
    """
    Returns a safe AgentDecision-compatible dict used when:
      • The LLM output cannot be parsed as JSON
      • A required field is missing from the LLM response
      • Any unrecoverable error occurs inside the agent

    Forces ESCALATE so a human agent always reviews problematic turns.
    """
    logger.warning("Agent fallback activated: mode=%s reason=%s", mode, reason)
    return {
        "mode": mode,
        "action": "escalate",
        "tool": None,
        "tool_input": {},
        "confidence": 0.0,
        "reasoning": f"Fallback — {reason}",
        "message": (
            "I'm having trouble processing this request right now. "
            "A support agent will follow up with you shortly."
        ),
    }


# ── History formatter ─────────────────────────────────────────────────────────

def format_history(history: List[Dict[str, Any]], max_messages: int = 10) -> str:
    """
    Render conversation history as a plain-text string for prompt injection.

    Limits to `max_messages` most recent turns; truncates older ones silently.
    """
    recent = history[-max_messages:]
    lines: List[str] = []
    for msg in recent:
        role = msg.get("role", "unknown").upper()
        content = msg.get("content", "").strip()
        lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else "(no conversation history)"


# ── Ticket context formatter ──────────────────────────────────────────────────

def format_ticket_context(ctx: Dict[str, Any]) -> str:
    """
    Render ticket metadata as a compact string for prompt injection.

    Renders two sections:
      1. Standard ticket fields  (ticket_id, priority, status, …)
      2. Conversation intelligence fields injected by ChatService
         (conv_intent, conv_stage, conv_severity, conv_entities, …)
         — only rendered when present, fully backwards-compatible.
    """
    # ── Section 1: Standard ticket metadata ───────────────────────────────
    ticket_fields = {
        "Ticket ID": ctx.get("ticket_id", "N/A"),
        "Priority":  ctx.get("priority", "MEDIUM"),
        "Status":    ctx.get("status", "OPEN"),
        "Category":  ctx.get("category", "General"),
        "Assigned To": ctx.get("assigned_to", "Unassigned"),
        "Created":   ctx.get("created_at", ""),
    }
    lines = [f"  {k}: {v}" for k, v in ticket_fields.items() if v]

    # ── Section 2: Conversation intelligence (optional) ───────────────────
    intent    = ctx.get("conv_intent")
    stage     = ctx.get("conv_stage")
    severity  = ctx.get("conv_severity")
    turn      = ctx.get("conv_turn")
    unres     = ctx.get("conv_unresolved_turns")
    entities: Dict[str, Any] = ctx.get("conv_entities") or {}

    has_conv_intel = any([intent, stage, severity, turn is not None, entities])
    if has_conv_intel:
        lines.append("")   # blank separator line
        lines.append("  [Conversation Intelligence]")
        if intent:
            lines.append(f"  User Intent: {intent}")
        if stage:
            lines.append(f"  Conversation Stage: {stage}")
        if severity:
            lines.append(f"  User Sentiment: {severity}")
        if turn is not None:
            lines.append(f"  Turn Number: {turn}")
        if unres:
            lines.append(f"  Unresolved Turns: {unres}")
        for etype, values in entities.items():
            if values:
                label = etype.replace("_", " ").title()
                lines.append(f"  {label}: {', '.join(str(v) for v in values)}")

    return "\n".join(lines)
