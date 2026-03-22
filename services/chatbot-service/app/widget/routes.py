"""
Widget Routes
──────────────
Public-facing endpoints for the embeddable website chatbot widget.

POST /widget/chat          — standard request/response (JSON)
POST /widget/chat/stream   — SSE streaming (token-by-token)

Security model
──────────────
These endpoints are intentionally PUBLIC — no internal auth token is required
because they are called from the visitor's browser, not from a trusted service.

Protection is provided by:
  1. Rate limiting    — WidgetRateLimiter (30 req/60 s per org+IP, 200/60 s per org)
  2. Input validation — Pydantic models enforce field lengths and types
  3. org_id scoping   — all data access is scoped to org_id from the request body
  4. Conversation guard — security guardrails run inside the agent

Client-IP extraction
────────────────────
We read X-Forwarded-For (set by nginx/load-balancer) and fall back to the
direct connection IP.  Only the first hop is trusted to prevent IP spoofing
via header injection.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.widget.rate_limiter import widget_rate_limiter
from app.widget.schemas import WidgetChatRequest, WidgetChatResponse
from app.widget.session_memory import widget_session_memory
from app.widget.session_service import widget_session_service

router = APIRouter(prefix="/widget", tags=["widget"])
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    """
    Extract client IP, preferring X-Forwarded-For (first hop only).
    Falls back to direct connection address.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _check_rate_limit(org_id: str, client_ip: str) -> None:
    """Raise HTTP 429 if the request exceeds rate limits."""
    allowed = await widget_rate_limiter.is_allowed(org_id, client_ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again.",
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=WidgetChatResponse)
async def widget_chat(
    body: WidgetChatRequest,
    request: Request,
) -> WidgetChatResponse:
    """
    Standard request/response widget chat.

    Returns a complete reply with optional action hints and escalation status.
    Use this for environments where SSE is not supported.
    """
    client_ip = _get_client_ip(request)
    await _check_rate_limit(body.org_id, client_ip)

    try:
        return await widget_session_service.handle(body, widget_session_memory)
    except Exception as exc:
        logger.error(
            "widget_chat error: session=%s org=%s: %s",
            body.session_id,
            body.org_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chat processing failed. Please try again.",
        )


@router.post("/chat/stream")
async def widget_chat_stream(
    body: WidgetChatRequest,
    request: Request,
) -> StreamingResponse:
    """
    SSE streaming widget chat.

    Emits tokens as `data: <token>\\n\\n` events.
    Terminates with `data: [DONE]\\n\\n`.

    The final event before [DONE] is a JSON metadata event:
      data: {"type":"meta","escalated":false,"ticket_id":null,"trace_id":"..."}

    Client-side usage:
      const es = new EventSource('/widget/chat/stream', { method: 'POST', ... });
      es.onmessage = (e) => {
        if (e.data === '[DONE]') return es.close();
        const payload = JSON.parse(e.data);   // token or meta object
        if (payload.type === 'meta') { /* handle escalation etc. */ }
        else appendToken(payload);
      };
    """
    client_ip = _get_client_ip(request)
    await _check_rate_limit(body.org_id, client_ip)

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            response = await widget_session_service.handle(body, widget_session_memory)

            # Stream reply tokens word-by-word
            words = response.reply.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                yield f"data: {chunk}\n\n"

            # Final metadata event
            import json
            meta = {
                "type":       "meta",
                "escalated":  response.escalated,
                "ticket_id":  response.ticket_id,
                "trace_id":   response.trace_id,
                "confidence": response.confidence,
                "actions":    [a.model_dump() for a in response.actions],
            }
            yield f"data: {json.dumps(meta)}\n\n"

        except Exception as exc:
            logger.error(
                "widget_stream error: session=%s org=%s: %s",
                body.session_id,
                body.org_id,
                exc,
                exc_info=True,
            )
            yield "data: [ERROR]\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":       "keep-alive",
        },
    )
