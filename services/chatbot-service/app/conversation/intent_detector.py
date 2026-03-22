"""
Intent Detector
────────────────
Classifies the user's message into a granular business intent.

Why this is separate from QueryRouter
──────────────────────────────────────
query_router.py answers "which pipeline path?" (5 buckets: small_talk, faq,
action, complaint, unknown).  That's routing.

IntentDetector answers "what does the user WANT?" (9 business intents: refund,
billing, status_check, cancellation…).  That's intent.  Both run in parallel;
they serve different consumers:
  • QueryRouter → RAG pipeline decides whether to retrieve
  • IntentDetector → ConversationState + agent prompt + escalation scoring

Classification strategy
────────────────────────
1. Rule-based regex (O(n), zero cost)    — handles ~85% of messages instantly.
2. LLM single-word fallback (~50 tokens) — only for ambiguous messages.

Adding a new intent: add patterns to _INTENT_PATTERNS, a label to Intent,
and (optionally) a sub-intent string.  No other changes required.
"""
from __future__ import annotations

import logging
import re
from enum import Enum
from typing import Optional

from pydantic import BaseModel

from app.llm.gateway_client import gateway_client

logger = logging.getLogger(__name__)


# ── Intent taxonomy ───────────────────────────────────────────────────────────

class Intent(str, Enum):
    COMPLAINT          = "complaint"         # Expressing dissatisfaction
    REFUND_REQUEST     = "refund_request"    # Wants money back / chargeback
    BILLING            = "billing"           # Invoice, charge, subscription query
    TECHNICAL_SUPPORT  = "technical_support" # Broken feature, error, bug
    STATUS_CHECK       = "status_check"      # Where is my order / ticket update
    CANCELLATION       = "cancellation"      # Cancel account / subscription / order
    INFO_REQUEST       = "info_request"      # How-to, what-is, general question
    COMPLIMENT         = "compliment"        # Positive feedback
    GENERAL            = "general"           # Catch-all / ambiguous


# ── Detection result ──────────────────────────────────────────────────────────

class IntentResult(BaseModel):
    intent: Intent
    confidence: float          # 0.0–1.0
    sub_intent: Optional[str] = None   # e.g. "duplicate_charge", "login_error"
    raw_query: str


# ── Rule tables ───────────────────────────────────────────────────────────────
# Each entry: (compiled_pattern, confidence, sub_intent_label)

_INTENT_PATTERNS: dict[Intent, list[tuple[re.Pattern, float, Optional[str]]]] = {

    Intent.REFUND_REQUEST: [
        (re.compile(r"\b(refund|money\s*back|reimburse|chargeback|charge.?back|return.*(?:money|payment)|get.*(?:my\s+)?money)\b", re.I), 0.95, "refund"),
        (re.compile(r"\b(overcharge[d]?|charged.*(?:twice|double|wrong|extra)|duplicate.*charge|wrong.*amount)\b", re.I), 0.90, "overcharge"),
    ],

    Intent.BILLING: [
        (re.compile(r"\b(invoice|billing|bill\b|subscription|payment\s+(?:due|failed|pending)|credit\s+card|debit\s+card|payment\s+method|renew)\b", re.I), 0.92, "billing_query"),
        (re.compile(r"\b(plan|upgrade|downgrade|pricing|cost|price|fee|charge(?!back))\b", re.I), 0.80, "plan_pricing"),
    ],

    Intent.CANCELLATION: [
        (re.compile(r"\b(cancel\s+(?:my\s+)?(?:account|subscription|order|service|plan)|delete\s+(?:my\s+)?account|terminate\s+(?:service|subscription)|unsubscribe)\b", re.I), 0.95, "cancellation"),
        (re.compile(r"\b(close\s+(?:my\s+)?account|stop\s+(?:my\s+)?(?:service|subscription|plan))\b", re.I), 0.88, "account_closure"),
    ],

    Intent.STATUS_CHECK: [
        (re.compile(r"\b((?:order|delivery|shipment|ticket|case|request)\s+status|where\s+is\s+my|tracking|when\s+will\s+(?:it|my|the)|update\s+on\s+my|any\s+(?:news|update))\b", re.I), 0.92, "status_query"),
        (re.compile(r"\b(still\s+waiting|hasn'?t\s+(?:arrived|been\s+resolved)|how\s+long\s+will|ETA|estimated\s+time)\b", re.I), 0.85, "eta_query"),
    ],

    Intent.TECHNICAL_SUPPORT: [
        (re.compile(r"\b(error|bug|crash(?:ed|ing)?|not\s+(?:loading|working|responding)|broken|glitch|freeze|hang(?:ing)?|fail(?:ed|ing|ure)?)\b", re.I), 0.90, "technical_error"),
        (re.compile(r"\b(can'?t\s+(?:log\s*in|sign\s*in|access|open|connect)|login\s+(?:issue|problem|error)|password\s+reset|forgot\s+password|two.?factor|account\s+locked)\b", re.I), 0.93, "login_access"),
        (re.compile(r"\b(slow|performance|laggy|takes\s+(?:forever|too\s+long)|timeout|503|404|500)\b", re.I), 0.80, "performance"),
        (re.compile(r"\b(not\s+receiving|missing\s+(?:email|notification|message)|didn'?t\s+get|never\s+(?:received|arrived))\b", re.I), 0.82, "missing_comms"),
    ],

    Intent.COMPLAINT: [
        (re.compile(r"\b(unacceptable|ridiculous|terrible|awful|horrible|worst|disgusting|pathetic|useless|incompetent|furious|outraged|livid|appalling)\b", re.I), 0.95, "strong_complaint"),
        (re.compile(r"\b(disappointed|let\s+down|not\s+(?:good|great|happy|satisfied)|very\s+(?:frustrated|upset|annoyed)|this\s+is\s+(?:ridiculous|unacceptable))\b", re.I), 0.85, "mild_complaint"),
        (re.compile(r"\b(complaint|complain|issue\s+(?:with|about)|problem\s+(?:with|about)|never\s+again|won'?t\s+(?:use|recommend))\b", re.I), 0.80, "formal_complaint"),
    ],

    Intent.COMPLIMENT: [
        (re.compile(r"\b(amazing|excellent|fantastic|outstanding|great\s+(?:job|service|support|work)|love\s+(?:your|the)|very\s+helpful|super\s+helpful|really\s+(?:appreciate|helpful)|best\s+(?:service|support))\b", re.I), 0.92, "strong_compliment"),
        (re.compile(r"\b(thank\s+you\s+(?:so\s+much|very\s+much)|much\s+appreciated|really\s+happy|very\s+satisfied|pleased\s+with)\b", re.I), 0.85, "mild_compliment"),
    ],

    Intent.INFO_REQUEST: [
        (re.compile(r"\b(how\s+(?:do|can|should|to)|what\s+(?:is|are|does|do)|where\s+(?:is|can|do)|when\s+(?:will|is|can)|why\s+(?:is|does|can)|is\s+it\s+possible|can\s+I|could\s+you\s+explain|tell\s+me\s+(?:about|how|what)|help\s+me\s+understand)\b", re.I), 0.85, "how_to"),
        (re.compile(r"\b(documentation|guide|tutorial|instructions|steps\s+to|how\s+to\s+set\s+up|getting\s+started)\b", re.I), 0.88, "documentation"),
    ],
}

# LLM fallback prompt — single-word response, cheap
_INTENT_SYSTEM = """\
Classify the following customer support message into exactly ONE intent.
Valid intents: complaint | refund_request | billing | technical_support | status_check | cancellation | info_request | compliment | general

Rules:
- complaint: expressing strong dissatisfaction, anger, or frustration
- refund_request: asking for money back, disputing a charge
- billing: questions about invoices, subscription, pricing, payments
- technical_support: reporting errors, bugs, access issues, broken features
- status_check: asking about order/ticket status, ETA, delivery
- cancellation: wanting to cancel account, subscription, or service
- info_request: asking how something works, requesting documentation
- compliment: positive feedback, expressions of satisfaction
- general: does not clearly fit any of the above

Respond with ONLY the intent name — no explanation, no punctuation.
"""


class IntentDetector:
    """
    Detects the user's business intent from a single message.

    Returns an IntentResult with the detected intent, confidence, and optional
    sub-intent for more granular understanding (e.g. "login_error" within
    technical_support).
    """

    async def detect(self, org_id: str, message: str) -> IntentResult:
        """
        Classify message intent.  Rule-based first; LLM fallback if ambiguous.
        Never raises — falls back to GENERAL on any error.
        """
        try:
            result = self._rule_based(message)
            if result is not None:
                return result
            return await self._llm_fallback(org_id, message)
        except Exception as exc:
            logger.warning("IntentDetector failed (non-fatal): %s", exc)
            return IntentResult(
                intent=Intent.GENERAL,
                confidence=0.0,
                raw_query=message,
            )

    # ── Stage 1: rule-based ───────────────────────────────────────────────────

    def _rule_based(self, message: str) -> Optional[IntentResult]:
        """
        Scan all intent pattern tables.  Returns the highest-confidence match,
        or None if no pattern fires (hands off to LLM stage).

        Priority order is fixed by the dict insertion order — intents listed
        earlier (REFUND > BILLING > CANCELLATION …) win ties at equal confidence.
        """
        best_intent: Optional[Intent] = None
        best_confidence: float = 0.0
        best_sub: Optional[str] = None

        for intent, patterns in _INTENT_PATTERNS.items():
            for pattern, confidence, sub in patterns:
                if pattern.search(message):
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_intent = intent
                        best_sub = sub

        if best_intent is not None:
            return IntentResult(
                intent=best_intent,
                confidence=best_confidence,
                sub_intent=best_sub,
                raw_query=message,
            )

        # No rule fired — return None to trigger LLM fallback
        return None

    # ── Stage 2: LLM fallback ─────────────────────────────────────────────────

    async def _llm_fallback(self, org_id: str, message: str) -> IntentResult:
        """
        Single cheap LLM call (~50 tokens) for ambiguous messages.
        Falls back to GENERAL if the call fails or returns an unrecognised label.
        """
        try:
            result = await gateway_client.generate(
                org_id=org_id,
                messages=[{"role": "user", "content": message}],
                system_prompt=_INTENT_SYSTEM,
            )
            raw = result.get("content", "").strip().lower()
            intent = Intent(raw) if raw in Intent._value2member_map_ else Intent.GENERAL
            confidence = 0.70 if intent != Intent.GENERAL else 0.40

            logger.debug("LLM intent: %r → %s (conf=%.2f)", message[:60], intent, confidence)
            return IntentResult(
                intent=intent,
                confidence=confidence,
                raw_query=message,
            )

        except Exception as exc:
            logger.warning("LLM intent fallback failed: %s", exc)
            return IntentResult(
                intent=Intent.GENERAL,
                confidence=0.30,
                raw_query=message,
            )


# ── Module-level singleton ────────────────────────────────────────────────────
intent_detector = IntentDetector()
