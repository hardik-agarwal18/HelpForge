"""
Internal Routes
────────────────
These endpoints are NOT exposed publicly.  They are called exclusively by the
Node.js chatbot bridge worker after consuming a BullMQ job, or by the API
Gateway's AI modules via service-to-service calls.

Security: four-layer auth via require_internal_auth (see app/security/internal_auth.py):
  1. X-Internal-Token shared secret (supports rotation via previous token)
  2. IP allowlist (CIDR-based, Docker-bridge-aware)
  3. HMAC-SHA256 request signature (replay-attack prevention)
  4. Nonce cache (replay attack prevention)

Agent endpoints added:
  POST /internal/agent/run           — unified agent (any mode)
  POST /internal/agent/automation    — convenience wrapper for AUTOMATION mode
  POST /internal/agent/augmentation  — convenience wrapper for AUGMENTATION mode
"""

import logging

from fastapi import APIRouter, Depends

from app.models.schemas import (
    AgentRequest,
    AgentResponse,
    AnalyzeFeedbackRequest,
    AnalyzeFeedbackResponse,
    EmbedRequest,
    EmbedResponse,
    ProcessDocumentRequest,
    ProcessDocumentResponse,
    ReEmbedOrgRequest,
    ReEmbedOrgResponse,
)
from app.security.internal_auth import require_internal_auth
from app.services.document_service import document_service
from app.services.feedback_service import feedback_service
from app.services.migration_service import migration_service

router = APIRouter(prefix="/internal", tags=["internal"])
logger = logging.getLogger(__name__)

_INTERNAL = [Depends(require_internal_auth)]


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


# ── Unified Agent Endpoints ────────────────────────────────────────────────────

@router.post(
    "/agent/run",
    response_model=AgentResponse,
    dependencies=_INTERNAL,
)
async def agent_run(request: AgentRequest) -> AgentResponse:
    """
    General-purpose unified agent endpoint.
    Accepts any mode: chat | automation | augmentation.

    Called by:
      • API Gateway automation module (mode=automation)
      • API Gateway augmentation module (mode=augmentation)
      • Direct service-to-service calls that need agent decisions
    """
    from app.agent.agent import unified_agent
    from app.agent.schema import AgentInput, AgentMode

    inp = AgentInput(
        mode=AgentMode(request.mode),
        org_id=request.org_id,
        ticket_id=request.ticket_id,
        user_id=request.user_id,
        query=request.query,
        ticket_context=request.ticket_context,
        rag_context=request.rag_context,
        history=request.history,
        extra=request.extra,
    )

    decision = await unified_agent.run(inp)

    logger.info(
        "Agent run: org=%s ticket=%s mode=%s action=%s confidence=%.3f",
        request.org_id,
        request.ticket_id,
        decision.mode,
        decision.action,
        decision.confidence,
    )

    return AgentResponse(
        mode=decision.mode.value,
        action=decision.action.value,
        tool=decision.tool,
        tool_input=decision.tool_input,
        confidence=decision.confidence,
        reasoning=decision.reasoning,
        message=decision.message,
        tool_result=decision.tool_result,
        metadata=decision.metadata,
    )


@router.post(
    "/agent/automation",
    response_model=AgentResponse,
    dependencies=_INTERNAL,
)
async def agent_automation(request: AgentRequest) -> AgentResponse:
    """
    Convenience endpoint that forces mode=automation.
    Called by BullMQ bridge worker on every ticket comment event.

    The request.mode field is ignored — automation is always set.
    """
    request.mode = "automation"
    return await agent_run(request)


@router.post(
    "/agent/augmentation",
    response_model=AgentResponse,
    dependencies=_INTERNAL,
)
async def agent_augmentation(request: AgentRequest) -> AgentResponse:
    """
    Convenience endpoint that forces mode=augmentation.
    Called by API Gateway when a human agent opens a ticket for review.

    The request.mode field is ignored — augmentation is always set.
    """
    request.mode = "augmentation"
    return await agent_run(request)
