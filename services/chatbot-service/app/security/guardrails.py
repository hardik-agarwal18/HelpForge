"""
Security Guardrails
────────────────────
Two-layer protection applied to every chat turn:

  Layer 1 — Input sanitization (before LLM):
    • Detect prompt injection attempts (pattern-based, O(n) regex, fast)
    • Enforce length limits (prevents token flooding)
    • Strip control characters

  Layer 2 — Output validation (after LLM):
    • Check for accidental system-prompt leakage
    • Check for cross-tenant data references

Why pattern-based instead of ML-based?
  • Zero latency (sub-millisecond)
  • No external call needed
  • Fails safe — false positive = polite refusal, not a breach

The system prompt itself is hardened (see prompt_builder.py) as a
defense-in-depth companion to these runtime checks.
"""

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Input injection patterns ──────────────────────────────────────────────────

_INJECTION_PATTERNS: list[str] = [
    # Instruction override
    r"ignore\s+(all\s+)?previous\s+instructions?",
    r"disregard\s+(your\s+)?(previous\s+)?instructions?",
    r"forget\s+(everything|your|all)\s+",
    r"new\s+(system\s+)?prompt\s*[:\-]",
    r"override\s+(your\s+)?(previous\s+)?instructions?",
    # Persona hijacking
    r"you\s+are\s+now\s+(?!a\s+(?:helpful|support|customer))",
    r"act\s+as\s+(?!a\s+(?:helpful|support|customer))",
    r"pretend\s+(you\s+are|to\s+be)\s+",
    r"roleplay\s+as\s+",
    r"\bDAN\b",                              # "Do Anything Now" jailbreak
    # Cross-tenant data exfiltration
    r"(show|list|dump|reveal|print|output|leak)\s+(all\s+)?(other\s+)?"
    r"(users?|tickets?|organizations?|orgs?|tenants?|customers?|data)",
    r"(access|read|get)\s+(other|another)\s+(org|organization|tenant|customer)",
    r"(from|for)\s+(all\s+)?(other\s+)?(organizations?|tenants?|customers?)",
    # Prompt structure injection
    r"<\s*/?system\s*>",                     # XML tags
    r"\[INST\]",                             # Llama marker
    r"###\s*(system|instruction)",           # Alpaca marker
    r"Human:\s*\n",                          # Anthropic format injection
]

_INPUT_RE = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in _INJECTION_PATTERNS]

# ── Output leak patterns ──────────────────────────────────────────────────────

_OUTPUT_PATTERNS: list[str] = [
    r"system\s+prompt",
    r"internal\s+instructions?",
    r"other\s+(tenant|org|organization|customer)\s+(data|ticket|information)",
    r"INTERNAL_SERVICE_TOKEN",
    r"api.?key",
]

_OUTPUT_RE = [re.compile(p, re.IGNORECASE) for p in _OUTPUT_PATTERNS]

# ── Max input length ──────────────────────────────────────────────────────────

_MAX_INPUT_CHARS = 4_000
_SAFE_REFUSAL = (
    "I'm sorry, but I can't process that request. "
    "Please rephrase your question and try again."
)


@dataclass
class GuardResult:
    safe: bool
    reason: str = ""
    safe_value: str = ""  # sanitized input OR validated output


class Guardrails:
    # ── Input layer ───────────────────────────────────────────────────────────

    def check_input(self, query: str, org_id: str) -> GuardResult:
        """
        Validate and sanitize user input before it enters the RAG pipeline.
        Returns GuardResult(safe=False) with reason if a threat is detected.
        """
        if not query or not query.strip():
            return GuardResult(safe=False, reason="EMPTY_INPUT", safe_value="")

        # Strip null bytes and control chars (except newlines/tabs)
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", query).strip()

        # Length cap
        if len(cleaned) > _MAX_INPUT_CHARS:
            logger.warning("Input truncated: org=%s, len=%d", org_id, len(cleaned))
            cleaned = cleaned[:_MAX_INPUT_CHARS]

        # Injection detection
        for pattern in _INPUT_RE:
            if pattern.search(cleaned):
                logger.warning(
                    "Injection attempt blocked: org=%s, pattern=%r",
                    org_id,
                    pattern.pattern[:60],
                )
                return GuardResult(
                    safe=False,
                    reason="INJECTION_DETECTED",
                    safe_value=_SAFE_REFUSAL,
                )

        return GuardResult(safe=True, safe_value=cleaned)

    # ── Output layer ──────────────────────────────────────────────────────────

    def check_output(self, response: str, org_id: str) -> GuardResult:
        """
        Scan LLM output for accidental leakage or policy violations.
        On violation, returns a generic safe message instead.
        """
        for pattern in _OUTPUT_RE:
            if pattern.search(response):
                logger.error(
                    "Output policy violation: org=%s, pattern=%r",
                    org_id,
                    pattern.pattern[:60],
                )
                return GuardResult(
                    safe=False,
                    reason="OUTPUT_POLICY_VIOLATION",
                    safe_value=(
                        "I'm sorry, I encountered an issue processing your request. "
                        "A support agent will follow up with you shortly."
                    ),
                )

        return GuardResult(safe=True, safe_value=response)


guardrails = Guardrails()
