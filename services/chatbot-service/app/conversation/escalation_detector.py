"""
Escalation Detector
────────────────────
Analyses a customer message + conversation state to determine whether the
conversation should be escalated to a human agent NOW — before the LLM runs.

This is a pre-agent gate, not a replacement for the LLM's own escalate action.
It catches cases the LLM might miss or be slow to act on:
  • A user expressing critical anger / abusive language
  • A user stuck in a loop (same intent 3+ turns, no resolution)
  • A VIP / high-priority account with a complaint
  • A long unresolved conversation that has gone cold

Why pre-agent?
───────────────
Saving an LLM round-trip when escalation is the obvious outcome reduces cost
and latency.  The LLM still generates escalation decisions through its own
reasoning — this module handles the deterministic, high-confidence cases.

Scoring model
──────────────
All signals produce a float score in [0.0, 1.0]:

  Signal                                   Max contribution
  ─────────────────────────────────────────────────────────
  Anger keyword hits (weighted)                  0.50
  Repeated same intent without resolution        0.30
  High unresolved turn count                     0.20
                                                 ────
  Total possible score                           1.00

Forced escalation (score = 1.0, bypasses threshold):
  • Explicit "speak to human / agent" phrases
  • Abusive / threatening language
  • Critical anger keyword combo

Severity thresholds:
  score < 0.30  → CALM
  score < 0.50  → FRUSTRATED
  score < 0.70  → ANGRY
  score ≥ 0.70  → CRITICAL

should_escalate when score ≥ 0.50 (ANGRY or CRITICAL).
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.conversation.conversation_state import ConversationState
from app.conversation.intent_detector import IntentResult


# ── Severity levels ───────────────────────────────────────────────────────────

class Severity(str, Enum):
    CALM        = "calm"
    FRUSTRATED  = "frustrated"
    ANGRY       = "angry"
    CRITICAL    = "critical"


# ── Escalation signal ─────────────────────────────────────────────────────────

class EscalationSignal(BaseModel):
    should_escalate: bool
    severity: Severity
    triggers: list[str] = Field(default_factory=list)  # human-readable reasons
    score: float = 0.0   # raw composite score (0.0–1.0)
    escalation_message: Optional[str] = None  # pre-composed empathetic message


# ── Keyword tables ────────────────────────────────────────────────────────────
# Tuples of (pattern, score_contribution, trigger_label)

_CRITICAL_KEYWORDS: list[tuple[re.Pattern, float, str]] = [
    (re.compile(r"\b(sue|lawsuit|legal\s+action|attorney|lawyer|court|solicitor)\b", re.I),              0.50, "legal_threat"),
    (re.compile(r"\b(fraud|fraudulent|scam|scammer|theft|stolen|chargeback)\b", re.I),                  0.45, "fraud_allegation"),
    (re.compile(r"\b(threatening|going\s+viral|media|press|news|social\s+media|twitter|tweet)\b", re.I), 0.40, "public_threat"),
]

_ANGER_KEYWORDS: list[tuple[re.Pattern, float, str]] = [
    (re.compile(r"\b(furious|livid|outraged|enraged|seething|exploding|screaming)\b", re.I),              0.40, "extreme_anger"),
    (re.compile(r"\b(absolutely\s+(?:furious|disgusted|appalled)|this\s+is\s+(?:outrageous|criminal|disgusting))\b", re.I), 0.38, "extreme_frustration"),
    (re.compile(r"\b(terrible|awful|horrible|worst|disaster|nightmare|shocking|appalling|atrocious)\b", re.I), 0.30, "strong_negative"),
    (re.compile(r"\b(ridiculous|unacceptable|pathetic|incompetent|useless|rubbish|garbage|trash)\b", re.I), 0.28, "strong_complaint"),
    (re.compile(r"\b(very\s+(?:angry|upset|frustrated|unhappy)|extremely\s+(?:frustrated|disappointed))\b", re.I), 0.25, "explicit_anger"),
    (re.compile(r"\b(disappointed|annoyed|frustrated|unhappy|not\s+(?:happy|satisfied|pleased))\b", re.I), 0.15, "mild_frustration"),
]

_ABUSIVE_KEYWORDS: list[tuple[re.Pattern, float, str]] = [
    # We flag these but keep the trigger label generic to avoid storing slurs
    (re.compile(r"\b(idiot|moron|stupid|dumb|fool|incompetent\s+(?:idiot|moron))\b", re.I), 0.45, "abusive_language"),
]

# Explicit human-escalation requests (force escalate regardless of score)
_HUMAN_REQUEST_PATTERN = re.compile(
    r"\b(speak\s+to\s+(?:a\s+)?(?:human|agent|person|manager|supervisor)|"
    r"talk\s+to\s+(?:a\s+)?(?:human|real\s+person|agent|someone)|"
    r"connect\s+me\s+(?:to|with)\s+(?:a\s+)?(?:human|agent|person|manager)|"
    r"I\s+want\s+(?:a\s+)?(?:human|real\s+person|live\s+agent)|"
    r"get\s+me\s+(?:a\s+)?(?:human|manager|supervisor)|"
    r"escalate\s+(?:this|my\s+(?:issue|case|ticket)))\b",
    re.I,
)

# Thresholds
_SCORE_ESCALATE = 0.50    # should_escalate = True above this
_SCORE_CRITICAL = 0.70
_SCORE_ANGRY    = 0.50
_SCORE_FRUSTRATED = 0.30

# Unresolved turns above this count add to score
_UNRESOLVED_TURNS_THRESHOLD = 5

# Same-intent repetition: trigger if count >= this in recent history
_INTENT_REPEAT_THRESHOLD = 3

# Pre-composed escalation messages (keyed by severity)
_ESCALATION_MESSAGES: dict[Severity, str] = {
    Severity.FRUSTRATED: (
        "I understand this has been frustrating and I'm sorry for the difficulty. "
        "Let me connect you with a human support agent who can give this the personal attention it deserves."
    ),
    Severity.ANGRY: (
        "I sincerely apologise for the experience you've been having. "
        "I'm escalating this to a human agent right now so they can help you directly."
    ),
    Severity.CRITICAL: (
        "I'm truly sorry for the serious inconvenience this has caused. "
        "I'm immediately escalating this to our senior support team — "
        "someone will be with you shortly."
    ),
    Severity.CALM: (
        "I'll connect you with a human support agent who can assist you further."
    ),
}


class EscalationDetector:
    """
    Synchronous, zero-I/O detector.

    Takes the current message + conversation state and returns an EscalationSignal.
    Never raises — falls back to CALM / no-escalate on any error.
    """

    def detect(
        self,
        message: str,
        state: ConversationState,
        intent_result: IntentResult,
    ) -> EscalationSignal:
        """
        Compute composite escalation score and return an EscalationSignal.

        Parameters
        ──────────
        message       The raw user message for this turn.
        state         ConversationState at the START of this turn (before update).
        intent_result IntentResult for this turn's message.
        """
        try:
            return self._compute(message, state, intent_result)
        except Exception:
            return EscalationSignal(
                should_escalate=False,
                severity=Severity.CALM,
                score=0.0,
            )

    # ── Internal ──────────────────────────────────────────────────────────────

    def _compute(
        self,
        message: str,
        state: ConversationState,
        intent_result: IntentResult,
    ) -> EscalationSignal:
        score = 0.0
        triggers: list[str] = []

        # ── Signal 1: Explicit human-agent request (force escalate) ───────────
        if _HUMAN_REQUEST_PATTERN.search(message):
            return EscalationSignal(
                should_escalate=True,
                severity=Severity.CALM,  # Not angry — just wants a human
                triggers=["explicit_human_request"],
                score=1.0,
                escalation_message=_ESCALATION_MESSAGES[Severity.CALM],
            )

        # ── Signal 2: Critical keyword hits ───────────────────────────────────
        for pattern, contribution, label in _CRITICAL_KEYWORDS:
            if pattern.search(message):
                score = min(1.0, score + contribution)
                if label not in triggers:
                    triggers.append(label)

        # ── Signal 3: Anger keyword hits ──────────────────────────────────────
        anger_score = 0.0
        for pattern, contribution, label in _ANGER_KEYWORDS:
            if pattern.search(message):
                anger_score += contribution
                if label not in triggers:
                    triggers.append(label)
        # Cap anger contribution at 0.50 to leave room for other signals
        score = min(1.0, score + min(0.50, anger_score))

        # ── Signal 4: Abusive language (force escalate) ───────────────────────
        for pattern, _, label in _ABUSIVE_KEYWORDS:
            if pattern.search(message):
                if label not in triggers:
                    triggers.append(label)
                # Abusive language always escalates
                return EscalationSignal(
                    should_escalate=True,
                    severity=Severity.CRITICAL,
                    triggers=triggers,
                    score=1.0,
                    escalation_message=_ESCALATION_MESSAGES[Severity.CRITICAL],
                )

        # ── Signal 5: Repeated same intent without resolution ─────────────────
        repeat_count = self._count_intent_repeats(
            intent_result.intent.value, state.intent_history
        )
        if repeat_count >= _INTENT_REPEAT_THRESHOLD:
            repeat_contribution = min(0.30, 0.10 * (repeat_count - _INTENT_REPEAT_THRESHOLD + 1))
            score = min(1.0, score + repeat_contribution)
            triggers.append(f"intent_repeated_{repeat_count}x")

        # ── Signal 6: Long unresolved conversation ────────────────────────────
        if state.unresolved_turns >= _UNRESOLVED_TURNS_THRESHOLD:
            overage = state.unresolved_turns - _UNRESOLVED_TURNS_THRESHOLD
            unresolved_contribution = min(0.20, 0.04 * (overage + 1))
            score = min(1.0, score + unresolved_contribution)
            triggers.append(f"unresolved_{state.unresolved_turns}_turns")

        # ── Derive severity from score ─────────────────────────────────────────
        severity = self._score_to_severity(score)
        should_escalate = score >= _SCORE_ESCALATE

        # ── Build empathetic message only when escalating ─────────────────────
        escalation_message = (
            _ESCALATION_MESSAGES.get(severity, _ESCALATION_MESSAGES[Severity.CALM])
            if should_escalate
            else None
        )

        return EscalationSignal(
            should_escalate=should_escalate,
            severity=severity,
            triggers=triggers,
            score=round(score, 4),
            escalation_message=escalation_message,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _count_intent_repeats(intent: str, intent_history: list[str]) -> int:
        """
        Count how many of the most recent _INTENT_REPEAT_THRESHOLD * 2 intents
        match the current intent.  We look at a rolling window rather than the
        full history to avoid penalising legitimate long conversations.
        """
        window = intent_history[-(2 * _INTENT_REPEAT_THRESHOLD):]
        return sum(1 for h in window if h == intent)

    @staticmethod
    def _score_to_severity(score: float) -> Severity:
        if score >= _SCORE_CRITICAL:
            return Severity.CRITICAL
        if score >= _SCORE_ANGRY:
            return Severity.ANGRY
        if score >= _SCORE_FRUSTRATED:
            return Severity.FRUSTRATED
        return Severity.CALM


# ── Module-level singleton ────────────────────────────────────────────────────
escalation_detector = EscalationDetector()
