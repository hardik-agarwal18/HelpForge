"""
Chatbot Service — FastAPI entry point
──────────────────────────────────────
Startup:   initialise shared async clients (httpx pool, Redis)
Shutdown:  graceful close of all connections
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.chat import router as chat_router
from app.api.feedback import router as feedback_router
from app.config.settings import settings
from app.embeddings.embedder import embedder
from app.internal.routes import router as internal_router
from app.llm.gateway_client import gateway_client
from app.memory.ticket_memory import ticket_memory
from app.memory.summarizer import summarizer
from app.middleware.request_id import RequestIDFilter, RequestIDMiddleware
from app.services.feedback_service import feedback_service

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] — %(message)s",
)
# Inject request_id into every log record across all loggers
logging.getLogger().addFilter(RequestIDFilter())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Chatbot service starting (env=%s)", settings.environment)
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
    logger.info("Chatbot service shutdown complete")


app = FastAPI(
    title="HelpForge Chatbot Service",
    description="RAG-powered AI support brain — customer chatbot, agent assist, auto-resolution",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,   # hide Swagger in production
    redoc_url=None,
)

# ── Middleware ─────────────────────────────────────────────────────────────────
app.add_middleware(RequestIDMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(chat_router)
app.include_router(feedback_router)
app.include_router(internal_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["ops"])
async def health():
    return {"status": "healthy", "service": settings.service_name}
