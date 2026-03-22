"""
Internal Routes
────────────────
These endpoints are NOT exposed publicly.  They are called exclusively by the
Node.js chatbot bridge worker after consuming a BullMQ job.

Security: every request must carry the shared `X-Internal-Token` header.
The token is validated via FastAPI dependency injection — the check happens
before any handler body executes.
"""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from app.config.settings import settings
from app.models.schemas import (
    AnalyzeFeedbackRequest,
    AnalyzeFeedbackResponse,
    EmbedRequest,
    EmbedResponse,
    ProcessDocumentRequest,
    ProcessDocumentResponse,
    ReEmbedOrgRequest,
    ReEmbedOrgResponse,
)
from app.services.document_service import document_service
from app.services.feedback_service import feedback_service
from app.services.migration_service import migration_service

router = APIRouter(prefix="/internal", tags=["internal"])
logger = logging.getLogger(__name__)


# ── Auth dependency ───────────────────────────────────────────────────────────

async def require_internal_token(
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> None:
    if x_internal_token != settings.internal_service_token:
        logger.warning("Rejected internal request: invalid token")
        raise HTTPException(status_code=403, detail="Forbidden")


_INTERNAL = [Depends(require_internal_token)]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/process-document",
    response_model=ProcessDocumentResponse,
    dependencies=_INTERNAL,
)
async def process_document(
    request: ProcessDocumentRequest,
) -> ProcessDocumentResponse:
    """
    Called by Node worker after `process-document` BullMQ job.
    Chunks, embeds, and stores a document in the org's Qdrant collection.
    """
    return await document_service.process_document(request)


@router.post(
    "/embed",
    response_model=EmbedResponse,
    dependencies=_INTERNAL,
)
async def embed(request: EmbedRequest) -> EmbedResponse:
    """
    Called by Node worker after `embed-texts` BullMQ job.
    Embeds arbitrary texts and inserts vectors into Qdrant.
    """
    return await document_service.embed_texts(request)


@router.post(
    "/analyze-feedback",
    response_model=AnalyzeFeedbackResponse,
    dependencies=_INTERNAL,
)
async def analyze_feedback(
    request: AnalyzeFeedbackRequest,
) -> AnalyzeFeedbackResponse:
    """
    Called by Node worker after `analyze-feedback` BullMQ job.
    Returns aggregated feedback stats for an org (or specific ticket).
    """
    stats = await feedback_service.get_stats(request.org_id)
    return AnalyzeFeedbackResponse(org_id=request.org_id, stats=stats)


@router.post(
    "/re-embed-org",
    response_model=ReEmbedOrgResponse,
    dependencies=_INTERNAL,
)
async def re_embed_org(request: ReEmbedOrgRequest) -> ReEmbedOrgResponse:
    """
    Called by Node worker after `re-embed-org` BullMQ job.
    Scrolls the org's Qdrant collection for chunks with a stale
    `embedding_version`, re-embeds them in-place with the current model,
    and returns counts for observability.
    """
    return await migration_service.run_migration(request)
