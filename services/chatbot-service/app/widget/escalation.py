"""
Widget Escalation
──────────────────
Handles the escalation path for pre-ticket widget sessions.

When the escalation detector fires (or the agent returns action="escalate"),
this module:

  1. Summarises the widget session into a human-readable ticket description
  2. Calls action_gateway.create_ticket() to create a real ticket in the system
  3. Clears the session memory so the next interaction starts fresh
  4. Returns the new ticket_id for inclusion in the API response

The ticket is created with:
  • subject  — derived from the last user message (first 100 chars)
  • description — full conversation transcript + page context
  • priority — escalated from conversation severity
  • category — derived from detected intent

This is the only module in the widget layer that calls action_gateway directly.
All other agent tool executions go through the agent's tool executor.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.agent.gateway import action_gateway
from app.widget.session_memory import WidgetSessionMemory

logger = logging.getLogger(__name__)

# Severity → ticket priority mapping
_SEVERITY_TO_PRIORITY: Dict[str, str] = {
    "calm":       "LOW",
    "frustrated": "MEDIUM",
    "angry":      "HIGH",
    "critical":   "URGENT",
}

# Intent → ticket category mapping
_INTENT_TO_CATEGORY: Dict[str, str] = {
    "refund_request":    "Billing",
    "billing":           "Billing",
    "cancellation":      "Billing",
    "technical_support": "Technical",
    "complaint":         "Complaint",
    "status_check":      "General",
    "info_request":      "General",
    "compliment":        "General",
    "general":           "General",
}


async def escalate_widget_session(
    *,
    org_id: str,
    session_id: str,
    messages: List[Dict[str, Any]],
    page_context: Dict[str, Any],
    intent: str = "general",
    severity: str = "calm",
    escalation_message: Optional[str] = None,
    session_memory: WidgetSessionMemory,
) -> Optional[str]:
    """
    Create a support ticket from a widget session and clear session state.

    Returns the new ticket_id on success, or None if ticket creation fails.
    The caller should still return a response to the user even on failure.
    """
    # ── Build ticket subject ──────────────────────────────────────────────────
    last_user_msg = _last_user_message(messages)
    subject = (last_user_msg[:97] + "...") if len(last_user_msg) > 100 else last_user_msg
    if not subject:
        subject = "Support request from website chat"

    # ── Build ticket description ──────────────────────────────────────────────
    description = _build_description(messages, page_context, intent, severity)

    priority = _SEVERITY_TO_PRIORITY.get(severity.lower(), "MEDIUM")
    category = _INTENT_TO_CATEGORY.get(intent.lower(), "General")

    # ── Create ticket via action gateway ─────────────────────────────────────
    try:
        result = await action_gateway.create_ticket(
            org_id=org_id,
            subject=subject,
            description=description,
            priority=priority,
            category=category,
        )
        ticket_id: Optional[str] = result.get("id") or result.get("ticket_id")
    except Exception as exc:
        logger.error(
            "widget_escalation: ticket creation failed org=%s session=%s: %s",
            org_id,
            session_id,
            exc,
        )
        return None

    if ticket_id:
        logger.info(
            "widget_escalation: ticket created org=%s session=%s ticket=%s",
            org_id,
            session_id,
            ticket_id,
        )
        # Clear session memory — the conversation now lives in the ticket
        await session_memory.clear(session_id)

    return ticket_id


# ── Private helpers ───────────────────────────────────────────────────────────

def _last_user_message(messages: List[Dict[str, Any]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return msg.get("content", "").strip()
    return ""


def _build_description(
    messages: List[Dict[str, Any]],
    page_context: Dict[str, Any],
    intent: str,
    severity: str,
) -> str:
    lines: List[str] = []

    # Header
    lines.append("## Support Request via Website Chat")
    lines.append("")

    # Page context section
    page = page_context.get("page", "general")
    product_id = page_context.get("product_id")
    lines.append(f"**Page:** {page}")
    if product_id:
        lines.append(f"**Product:** {product_id}")
    lines.append(f"**Detected Intent:** {intent}")
    lines.append(f"**Severity:** {severity}")
    lines.append("")

    # Conversation transcript
    lines.append("## Conversation Transcript")
    lines.append("")
    for msg in messages:
        role = msg.get("role", "unknown").capitalize()
        content = msg.get("content", "").strip()
        lines.append(f"**{role}:** {content}")
        lines.append("")

    return "\n".join(lines)
