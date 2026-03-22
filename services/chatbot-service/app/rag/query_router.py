"""
Query Understanding / Router
──────────────────────────────
Classifies every incoming message BEFORE it enters the RAG pipeline.

Why this matters
────────────────
Without a router, every message — including "hi" and "thanks" — pays for:
  • One embedding call
  • One Qdrant search
  • One re-ranker LLM call
  • One generation LLM call

The router short-circuits that for cheap query types:

  SMALL_TALK  →  canned template response          (0 LLM calls, 0 Qdrant calls)
  ACTION      →  detected intent + action response  (0 RAG calls)
  FAQ         →  full RAG pipeline                  (normal path)
  COMPLAINT   →  full RAG pipeline + escalation cue (normal path)
  UNKNOWN     →  full RAG pipeline (safe default)   (normal path)

Classification strategy
────────────────────────
1. Rule-based (O(n) regex) — handles ~80% of cases instantly, zero cost.
2. LLM classification — only invoked when rules are ambiguous, adds
   one cheap single-sentence call (~50 tokens).

Adding a new intent type requires only a new entry in the pattern tables
below — no changes to the pipeline.
"""

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from app.llm.gateway_client import gateway_client

logger = logging.getLogger(__name__)


# ─── Query types ──────────────────────────────────────────────────────────────

class QueryType(str, Enum):
    SMALL_TALK = "small_talk"   # greeting, thanks, bye → canned response
    ACTION     = "action"       # escalate, close, reopen → direct action
    FAQ        = "faq"          # how/what/where/when question → RAG
    COMPLAINT  = "complaint"    # problem/error/broken → RAG + escalation hint
    UNKNOWN    = "unknown"      # ambiguous → fall through to full RAG


# ─── Route result ─────────────────────────────────────────────────────────────

@dataclass
class RouteResult:
    query_type: QueryType
    intent: str                        # e.g. "greeting", "escalate", "how_to"
    confidence: float                  # 0.0–1.0
    use_rag: bool                      # whether the pipeline should run retrieval
    canned_response: Optional[str] = None    # non-None for SMALL_TALK
    extracted_action: Optional[str] = None  # non-None for ACTION
    metadata: dict[str, Any] = field(default_factory=dict)


# ─── Rule tables ──────────────────────────────────────────────────────────────

# SMALL_TALK: patterns → (intent, canned_response)
_SMALL_TALK_RULES: list[tuple[re.Pattern, str, str]] = [
    (
        re.compile(r"^(hi+|hello+|hey+|howdy|greetings|good\s+(morning|afternoon|evening))[!.,\s]*$", re.I),
        "greeting",
        "Hello! How can I help you today?",
    ),
    (
        re.compile(r"^(thanks?|thank\s+you|thx|ty|appreciate\s+it)[!.,\s]*$", re.I),
        "thanks",
        "You're welcome! Let me know if there's anything else I can help with.",
    ),
    (
        re.compile(r"^(bye|goodbye|see\s+you|cya|take\s+care|have\s+a\s+good)[!.,\s\w]*$", re.I),
        "farewell",
        "Goodbye! Feel free to return if you need further assistance.",
    ),
    (
        re.compile(r"^(ok|okay|got\s+it|understood|alright|sure|sounds?\s+good)[!.,\s]*$", re.I),
        "acknowledgment",
        "Got it! Is there anything specific I can help you with?",
    ),
    (
        re.compile(r"^(yes|no|yep|nope|yeah|nah)[!.,\s]*$", re.I),
        "short_reply",
        "Could you tell me more about what you're looking for?",
    ),
]

# ACTION: patterns → (intent, action_key)
_ACTION_RULES: list[tuple[re.Pattern, str, str]] = [
    (
        re.compile(r"\b(escalate|speak\s+to\s+(a\s+)?(human|agent|person|support)|talk\s+to\s+(a\s+)?human|need\s+a\s+human)\b", re.I),
        "escalate",
        "escalate",
    ),
    (
        re.compile(r"\b(close|resolve|mark\s+(as\s+)?(resolved|closed|done)|close\s+this\s+ticket)\b", re.I),
        "close_ticket",
        "close_ticket",
    ),
    (
        re.compile(r"\b(reopen|re-open|open\s+again|reactivate)\b", re.I),
        "reopen_ticket",
        "reopen_ticket",
    ),
    (
        re.compile(r"\b(cancel|abort|stop|never\s+mind)\b", re.I),
        "cancel",
        "cancel",
    ),
]

# ACTION canned responses
_ACTION_RESPONSES: dict[str, str] = {
    "escalate":      "I'll connect you with a human support agent right away. Please hold on.",
    "close_ticket":  "I've noted your request to close this ticket. A confirmation will be sent shortly.",
    "reopen_ticket": "I'll reopen this ticket so our team can follow up with you.",
    "cancel":        "No problem — let me know if there's anything else I can help you with.",
}

# FAQ signals: queries that look like questions → full RAG
_FAQ_SIGNALS = re.compile(
    r"\b(how\s+(do|can|should|to)|what\s+(is|are|does|do)|where\s+(is|can|do)|"
    r"when\s+(will|is|can)|why\s+(is|does|can)|can\s+you|could\s+you|is\s+there|"
    r"do\s+you|tell\s+me)\b|\?",
    re.I,
)

# COMPLAINT signals
_COMPLAINT_SIGNALS = re.compile(
    r"\b(not\s+working|broken|error|issue|problem|bug|fail(ed|ure|ing)?|"
    r"crash(ed|ing)?|can'?t|cannot|unable|doesn'?t\s+work|stopped\s+working|"
    r"trouble|frustrated|wrong|incorrect|missing)\b",
    re.I,
)

# LLM classification prompt — used only when rules are ambiguous
_ROUTER_SYSTEM = """\
Classify the following customer support message into exactly ONE category.
Categories: small_talk | faq | action | complaint | unknown

Rules:
- small_talk: greetings, thanks, acknowledgments, short social messages
- faq: questions asking how, what, where, when, why
- action: requesting escalation, ticket close/reopen, cancel
- complaint: reporting a problem, error, or broken feature
- unknown: none of the above

Respond with ONLY the category name — no explanation, no punctuation.
"""


class QueryRouter:
    """Classifies a user message and determines the pipeline path."""

    # ── Public interface ───────────────────────────────────────────────────

    async def classify(self, org_id: str, query: str) -> RouteResult:
        """
        Two-stage classification:
          1. Rule-based (fast, free) — returns immediately if confident.
          2. LLM-based  (fallback)  — only when rules are not conclusive.
        """
        fast = self._rule_based(query)
        if fast is not None:
            return fast

        return await self._llm_classify(org_id, query)

    # ── Rule-based (stage 1) ───────────────────────────────────────────────

    def _rule_based(self, query: str) -> Optional[RouteResult]:
        stripped = query.strip()

        # Very short input → treat as small talk unless it's a clear complaint
        if len(stripped) <= 8 and not _COMPLAINT_SIGNALS.search(stripped):
            return RouteResult(
                query_type=QueryType.SMALL_TALK,
                intent="short_input",
                confidence=0.75,
                use_rag=False,
                canned_response="Could you tell me more about what you need help with?",
            )

        # Check SMALL_TALK patterns first (exact phrase matching)
        for pattern, intent, canned in _SMALL_TALK_RULES:
            if pattern.match(stripped):
                return RouteResult(
                    query_type=QueryType.SMALL_TALK,
                    intent=intent,
                    confidence=0.95,
                    use_rag=False,
                    canned_response=canned,
                )

        # Check ACTION patterns
        for pattern, intent, action_key in _ACTION_RULES:
            if pattern.search(stripped):
                return RouteResult(
                    query_type=QueryType.ACTION,
                    intent=intent,
                    confidence=0.90,
                    use_rag=False,
                    extracted_action=action_key,
                    canned_response=_ACTION_RESPONSES.get(action_key),
                )

        # Check COMPLAINT signals
        if _COMPLAINT_SIGNALS.search(stripped):
            return RouteResult(
                query_type=QueryType.COMPLAINT,
                intent="problem_report",
                confidence=0.80,
                use_rag=True,
            )

        # Check FAQ signals
        if _FAQ_SIGNALS.search(stripped):
            return RouteResult(
                query_type=QueryType.FAQ,
                intent="how_to",
                confidence=0.75,
                use_rag=True,
            )

        # Ambiguous — hand off to LLM stage
        return None

    # ── LLM fallback (stage 2) ─────────────────────────────────────────────

    async def _llm_classify(self, org_id: str, query: str) -> RouteResult:
        """
        Single cheap LLM call (~50 tokens) for ambiguous queries.
        Falls back to UNKNOWN (use_rag=True) if the call fails.
        """
        try:
            result = await gateway_client.generate(
                org_id=org_id,
                messages=[{"role": "user", "content": query}],
                system_prompt=_ROUTER_SYSTEM,
            )
            raw = result.get("content", "").strip().lower()
            query_type = QueryType(raw) if raw in QueryType._value2member_map_ else QueryType.UNKNOWN

            logger.debug("LLM router: %r → %s", query[:60], query_type)
            return _make_route_result(query_type, confidence=0.70)

        except Exception as exc:
            logger.warning("LLM router failed, defaulting to UNKNOWN: %s", exc)
            return _make_route_result(QueryType.UNKNOWN, confidence=0.0)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_route_result(query_type: QueryType, confidence: float) -> RouteResult:
    """Build a RouteResult for LLM-classified or fallback results."""
    use_rag = query_type in (QueryType.FAQ, QueryType.COMPLAINT, QueryType.UNKNOWN)
    return RouteResult(
        query_type=query_type,
        intent=query_type.value,
        confidence=confidence,
        use_rag=use_rag,
        canned_response=_ACTION_RESPONSES.get(query_type.value) if not use_rag else None,
    )


query_router = QueryRouter()
