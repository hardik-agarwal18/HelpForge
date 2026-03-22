"""
Request ID Middleware
──────────────────────
Every HTTP request gets a unique trace ID that:

  • Flows IN  — accepted from X-Request-ID if the caller provides one
                (Node bridge passes its BullMQ job.id so both sides share the ID)
  • Generated — a new UUIDv4 when the header is absent
  • Flows OUT — returned in the X-Request-ID response header
  • Logged    — injected into every log record for the lifetime of the request
                via a ContextVar + logging.Filter (zero overhead on log calls)
  • Propagated— passed as X-Request-ID on all outbound httpx calls
                (see gateway_client.py — reads request_id_var directly)

Why pure ASGI, not BaseHTTPMiddleware?
  BaseHTTPMiddleware buffers the entire response body before sending it.
  That breaks SSE streaming (/chat/stream).  A raw ASGI middleware wraps
  the `send` coroutine instead, adding the header at the start-response
  message without touching the body.
"""

import logging
import uuid
from contextvars import ContextVar

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

# ── Module-level ContextVar ───────────────────────────────────────────────────
# Read from anywhere in the call stack (gateway_client, services, etc.)
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


# ── Logging filter ────────────────────────────────────────────────────────────

class RequestIDFilter(logging.Filter):
    """
    Injects `request_id` into every LogRecord.
    Attach to the root logger once — it then applies to all child loggers.

    Format string should include %(request_id)s, e.g.:
      "%(asctime)s %(levelname)s %(name)s [%(request_id)s] — %(message)s"
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        record.request_id = request_id_var.get("—")  # type: ignore[attr-defined]
        return True


# ── ASGI middleware ───────────────────────────────────────────────────────────

class RequestIDMiddleware:
    """
    Pure ASGI middleware — compatible with streaming / SSE responses.

    Reads X-Request-ID from the incoming request (or generates a new UUID),
    stores it in:
      - scope["state"]["request_id"]  → accessible as request.state.request_id
      - request_id_var ContextVar     → accessible anywhere in the call stack
    Appends X-Request-ID to the response headers.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        req_id = headers.get("x-request-id") or str(uuid.uuid4())

        # Make available via request.state.request_id
        scope.setdefault("state", {})
        scope["state"]["request_id"] = req_id

        # Set ContextVar for the duration of this request
        ctx_token = request_id_var.set(req_id)

        async def send_with_request_id(message: dict) -> None:
            if message["type"] == "http.response.start":
                # Append header without mutating the original message dict
                existing = list(message.get("headers", []))
                existing.append((b"x-request-id", req_id.encode()))
                message = {**message, "headers": existing}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_var.reset(ctx_token)
