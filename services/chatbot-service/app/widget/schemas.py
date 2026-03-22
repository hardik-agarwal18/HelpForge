"""
Widget API Schemas
──────────────────
Pydantic models for the public-facing chatbot widget endpoints.

These are deliberately separate from app/models/schemas.py to keep the
public surface area minimal and avoid coupling the widget API to internal
agent contracts.

WidgetContext   — page-level metadata sent by the embed script
WidgetChatRequest  — inbound chat message (session-based, no ticket)
WidgetChatResponse — outbound reply with optional escalation / action hints
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ── Embedded page context ─────────────────────────────────────────────────────

class WidgetContext(BaseModel):
    """
    Contextual metadata injected by the embed script on each page.

    page:        Which section of the site the user is on.
    product_id:  Optional product/plan identifier (e.g. "pro-annual").
    metadata:    Any additional key/value pairs the host page wants to pass
                 (e.g. plan tier, locale, feature flags).
    """
    page: Literal["product", "pricing", "docs", "general"] = "general"
    product_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


# ── Request / response ────────────────────────────────────────────────────────

class WidgetChatRequest(BaseModel):
    """
    Inbound widget chat message.

    session_id:  Client-generated or persisted UUIDv4.  The widget creates one
                 on first load and keeps it in localStorage (30 min TTL on
                 server side).
    org_id:      Organisation identifier — used to scope RAG and rate limiting.
    message:     The user's raw message text.
    context:     Optional page context injected by the embed script.
    """
    session_id: str = Field(..., min_length=1, max_length=128)
    org_id: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=4000)
    context: WidgetContext = Field(default_factory=WidgetContext)


class WidgetAction(BaseModel):
    """A structured action hint returned alongside the reply text."""
    type: Literal["open_docs", "view_pricing", "contact_form", "none"]
    label: str = ""
    url: Optional[str] = None


class WidgetChatResponse(BaseModel):
    """
    Outbound widget reply.

    reply:      The assistant's text response.
    actions:    Zero or more structured action buttons to render in the widget.
    confidence: LLM-reported confidence score (0–1).
    escalated:  True when the session was escalated and a ticket was created.
    ticket_id:  The newly-created ticket ID (only present when escalated=True).
    session_id: Echo of the request session_id so the client can persist it.
    trace_id:   Trace UUID for observability correlation.
    """
    reply: str
    actions: List[WidgetAction] = []
    confidence: float = Field(ge=0.0, le=1.0)
    escalated: bool = False
    ticket_id: Optional[str] = None
    session_id: str
    trace_id: Optional[str] = None
