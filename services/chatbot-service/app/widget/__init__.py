"""
Widget — pre-ticket public chatbot for website embeds.

Public surface:
  widget_session_service — main orchestrator
  widget_session_memory  — Redis-backed session store
  widget_rate_limiter    — sliding-window rate limiter
  router                 — FastAPI router (prefix /widget)
"""
from app.widget.rate_limiter import widget_rate_limiter
from app.widget.routes import router
from app.widget.session_memory import widget_session_memory
from app.widget.session_service import widget_session_service

__all__ = [
    "router",
    "widget_session_service",
    "widget_session_memory",
    "widget_rate_limiter",
]
