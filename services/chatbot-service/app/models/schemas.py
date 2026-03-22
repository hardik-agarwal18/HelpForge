from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


# ─── Shared primitives ────────────────────────────────────────────────────────

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: Optional[datetime] = None


# ─── Public API ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    org_id: str
    ticket_id: str
    user_id: str
    message: str
    context_window: int = Field(default=10, ge=1, le=50)
    mode: str = "support"  # "support" | "agent"
    ticket_context: Dict[str, Any] = {}


class ChatResponse(BaseModel):
    ticket_id: str
    message: str
    confidence: float
    action: str = "none"  # auto_resolve | suggest | escalate | none
    sources: List[Dict[str, Any]] = []
    metadata: Dict[str, Any] = {}


class FeedbackRequest(BaseModel):
    org_id: str
    ticket_id: str
    message_id: str
    rating: int = Field(ge=1, le=5)
    helpful: bool
    comment: Optional[str] = None


class FeedbackResponse(BaseModel):
    success: bool
    feedback_id: str


# ─── Internal endpoints (called by Node bridge worker) ───────────────────────

class ProcessDocumentRequest(BaseModel):
    org_id: str
    document_id: str
    content: str
    metadata: Dict[str, Any] = {}
    chunk: bool = True


class ProcessDocumentResponse(BaseModel):
    document_id: str
    chunks_created: int
    status: str


class EmbedRequest(BaseModel):
    org_id: str
    texts: List[str]
    metadata: List[Dict[str, Any]] = []


class EmbedResponse(BaseModel):
    embedded: int
    status: str


class AnalyzeFeedbackRequest(BaseModel):
    org_id: str
    ticket_id: Optional[str] = None
    feedback_data: Dict[str, Any] = {}


class AnalyzeFeedbackResponse(BaseModel):
    org_id: str
    stats: Dict[str, Any]


class ReEmbedOrgRequest(BaseModel):
    org_id: str
    target_version: Optional[str] = None  # defaults to settings.embedding_version


class ReEmbedOrgResponse(BaseModel):
    org_id: str
    stale_chunks_found: int
    chunks_re_embedded: int
    errors: int
    status: str  # "up_to_date" | "completed" | "completed_with_errors"
