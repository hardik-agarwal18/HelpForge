"""
Agent Decision Schema
──────────────────────
Unified output contract for all agent modes (chat, automation, augmentation).

Every LLM decision call returns JSON that is validated against AgentDecision.
All callers (chatbot endpoint, automation route, augmentation route) receive
this same structure so downstream consumers only need to handle one shape.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Enumerations ──────────────────────────────────────────────────────────────


class AgentMode(str, Enum):
    CHAT = "chat"
    AUTOMATION = "automation"
    AUGMENTATION = "augmentation"


class AgentAction(str, Enum):
    RESPOND = "respond"       # Normal text answer — no tool required
    TOOL_CALL = "tool_call"   # Execute a system action via the tool registry
    ESCALATE = "escalate"     # Hand off to a human agent immediately
    SUGGEST = "suggest"       # Propose an action (augmentation / low-confidence)


# ── Core schemas ──────────────────────────────────────────────────────────────


class AgentDecision(BaseModel):
    """
    Structured output from the agent decision engine.

    Serialisable as JSON — this is exactly what gets returned to callers
    (API Gateway, chatbot endpoint, automation handler, etc.).
    """

    mode: AgentMode
    action: AgentAction

    # Populated only when action == TOOL_CALL
    tool: Optional[str] = None
    tool_input: Dict[str, Any] = Field(default_factory=dict)

    # 0.0 = no confidence, 1.0 = fully confident
    confidence: float = Field(ge=0.0, le=1.0)

    # Short internal reasoning — NOT shown to end users
    reasoning: str

    # The message shown to the user (or sent as AI comment / suggestion)
    message: str

    # Populated after tool execution (for audit / follow-up LLM calls)
    tool_result: Optional[Dict[str, Any]] = None

    # Timing, counters, token usage injected by the agent after the run
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentInput(BaseModel):
    """
    Input payload for the unified agent.

    All callers map their domain objects to this common format:
      • chat_service → mode=CHAT, query=user message
      • automation handler → mode=AUTOMATION, query=event description
      • augmentation route → mode=AUGMENTATION, query=agent's question
    """

    mode: AgentMode
    org_id: str
    ticket_id: str
    user_id: Optional[str] = None

    # Primary query or event description — always required
    query: str

    # Full ticket metadata injected by the caller
    ticket_context: Dict[str, Any] = Field(default_factory=dict)

    # Optional pre-computed RAG context string (retrieval is skipped if set)
    rag_context: Optional[str] = None

    # Optional pre-loaded conversation history (memory read is skipped if set)
    history: Optional[List[Dict[str, Any]]] = None

    # Mode-specific extras: automation event_type, augmentation agent_id, etc.
    extra: Dict[str, Any] = Field(default_factory=dict)


class AgentContext(BaseModel):
    """
    Intermediate context object assembled before the LLM decision call.
    Never leaves the agent — used only to build prompts.
    """

    rag_docs: List[Dict[str, Any]] = Field(default_factory=list)
    rag_context_text: str = ""
    history: List[Dict[str, Any]] = Field(default_factory=list)
    ticket_summary: str = ""
