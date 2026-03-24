"""
Chatbot Service — FastAPI entry point
──────────────────────────────────────
Startup:   initialise shared async clients (httpx pool, Redis)
Shutdown:  graceful close of all connections
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Gauge, Histogram, make_asgi_app

from app.api.chat import router as chat_router
from app.api.feedback import router as feedback_router
from app.api.playground import router as playground_router
from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.internal.routes import router as internal_router
from app.llm.gateway_client import gateway_client
from app.memory.ticket_memory import ticket_memory
from app.memory.summarizer import summarizer
from app.middleware.request_id import RequestIDFilter, RequestIDMiddleware
from app.services.feedback_service import feedback_service
from app.widget.rate_limiter import widget_rate_limiter
from app.widget.routes import router as widget_router
from app.widget.session_memory import widget_session_memory

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] — %(message)s",
)
# Inject request_id into every log record across all loggers
logging.getLogger().addFilter(RequestIDFilter())
logger = logging.getLogger(__name__)

HTTP_REQUESTS_TOTAL = Counter(
    "helpforge_chatbot_http_requests_total",
    "Total number of HTTP requests handled by the chatbot service",
    ["method", "route", "status_code"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "helpforge_chatbot_http_request_duration_seconds",
    "HTTP request latency in seconds for the chatbot service",
    ["method", "route", "status_code"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)

HTTP_REQUESTS_IN_FLIGHT = Gauge(
    "helpforge_chatbot_http_requests_in_flight",
    "Current in-flight HTTP requests in the chatbot service",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Chatbot service starting (env=%s)", settings.environment)
    # ── Widget services startup ───────────────────────────────────────────
    await widget_session_memory.connect()
    await widget_rate_limiter.connect()
    yield
    # ── Cleanup ──────────────────────────────────────────────────────────
    await gateway_client.close()
    await embedder.close()
    await ticket_memory.close()
    await summarizer.close()
    await feedback_service.close()
    # Close agent action gateway client
    from app.agent.gateway import action_gateway
    await action_gateway.close()
    # Close widget services
    await widget_session_memory.close()
    await widget_rate_limiter.close()
    logger.info("Chatbot service shutdown complete")


app = FastAPI(
    title="HelpForge Chatbot Service",
    description="RAG-powered AI support brain — customer chatbot, agent assist, auto-resolution",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,   # hide Swagger in production
    redoc_url=None,
)

app.mount("/metrics", make_asgi_app())


@app.middleware("http")
async def prometheus_metrics_middleware(request, call_next):
    if request.url.path.startswith("/metrics"):
        return await call_next(request)

    start = time.perf_counter()
    HTTP_REQUESTS_IN_FLIGHT.inc()

    status_code = 500

    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception:
        status_code = 500
        raise
    finally:
        HTTP_REQUESTS_IN_FLIGHT.dec()

        route = "unmatched"
        route_obj = request.scope.get("route")
        route_path = getattr(route_obj, "path", None)
        if route_path:
            route = route_path

        labels = {
            "method": request.method,
            "route": route,
            "status_code": str(status_code),
        }
        HTTP_REQUESTS_TOTAL.labels(**labels).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(**labels).observe(
            time.perf_counter() - start
        )

# ── Middleware ─────────────────────────────────────────────────────────────────

# CORS — required for the public widget which is loaded on third-party domains.
# Internal endpoints (/chat, /internal) are NOT exposed publicly so they are
# excluded via the path prefix allowlist.  The widget prefix (/widget) is the
# only path that needs broad CORS access.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # Widget can be embedded on any domain
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

app.add_middleware(RequestIDMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(chat_router)
app.include_router(feedback_router)
app.include_router(internal_router)
app.include_router(playground_router)
app.include_router(widget_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["ops"])
async def health():
    return {"status": "healthy", "service": settings.service_name}
