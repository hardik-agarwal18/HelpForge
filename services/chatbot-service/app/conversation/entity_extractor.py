"""
Entity Extractor
─────────────────
Extracts structured business entities from a customer message using regex
patterns.  Zero LLM calls — fast, deterministic, free.

Entities extracted
───────────────────
  ORDER_ID    — ORD-123, #12345, "order 12345", "order number 12345"
  TICKET_REF  — TKT-123, ticket #123, "ticket 12345"
  ACCOUNT_ID  — ACCT-123, account #123, "account 12345"
  EMAIL       — user@domain.com
  AMOUNT      — $99.99, €100, £50, "99 dollars", "100 USD"
  DATE        — explicit dates + relative references (yesterday, last week…)
  PRODUCT     — quoted product names / "product XYZ" patterns

Why regex-only
───────────────
Entity extraction from support messages is highly structured — order IDs,
emails, and amounts follow predictable formats.  Regex covers >90% of cases
with zero latency and cost.  A future LLM-based NER pass can be added for
edge cases without changing this module's interface.

Adding a new entity type
─────────────────────────
1.  Add a value to the EntityType enum.
2.  Add one or more (pattern, normaliser_fn) entries to _ENTITY_RULES.
    The normaliser receives the raw match string and returns a clean value.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Any, Callable, Optional

from pydantic import BaseModel


# ── Entity types ──────────────────────────────────────────────────────────────

class EntityType(str, Enum):
    ORDER_ID   = "order_id"
    TICKET_REF = "ticket_ref"
    ACCOUNT_ID = "account_id"
    EMAIL      = "email"
    AMOUNT     = "amount"
    DATE       = "date"
    PRODUCT    = "product"


# ── Single extracted entity ───────────────────────────────────────────────────

class Entity(BaseModel):
    entity_type: EntityType
    value: str          # normalised value (stripped, uppercased IDs, etc.)
    raw_match: str      # original text that triggered the match


# ── Extraction result ─────────────────────────────────────────────────────────

class EntityResult(BaseModel):
    entities: list[Entity]

    @property
    def entity_map(self) -> dict[str, list[str]]:
        """
        Returns {entity_type: [value, …]} for fast lookup by consumers.
        Duplicate values for the same type are deduplicated.
        """
        out: dict[str, list[str]] = {}
        for e in self.entities:
            key = e.entity_type.value
            if key not in out:
                out[key] = []
            if e.value not in out[key]:
                out[key].append(e.value)
        return out

    def get(self, entity_type: EntityType) -> list[str]:
        """Shorthand: all values for a given type."""
        return [e.value for e in self.entities if e.entity_type == entity_type]

    def has(self, entity_type: EntityType) -> bool:
        return any(e.entity_type == entity_type for e in self.entities)


# ── Normaliser helpers ────────────────────────────────────────────────────────

def _upper(s: str) -> str:
    return s.strip().upper()

def _lower(s: str) -> str:
    return s.strip().lower()

def _strip(s: str) -> str:
    return s.strip()


# ── Rule table ────────────────────────────────────────────────────────────────
# Each entry: (entity_type, compiled_pattern, value_group_index, normaliser_fn)
# value_group_index = which regex group contains the clean value (0 = full match)

_RULE = tuple[EntityType, re.Pattern, int, Callable[[str], str]]

_ENTITY_RULES: list[_RULE] = [

    # ── Order IDs ──────────────────────────────────────────────────────────────
    # Matches: ORD-12345, ORDER-12345, #12345, "order 12345", "order number 12345"
    (
        EntityType.ORDER_ID,
        re.compile(r"\b(ORD(?:ER)?[-_]?\d{4,12})\b", re.I),
        1, _upper,
    ),
    (
        EntityType.ORDER_ID,
        re.compile(r"\border\s+(?:number\s+|#\s*|num\s+)?(\d{4,12})\b", re.I),
        1, lambda s: f"ORD-{s.strip()}",
    ),
    (
        EntityType.ORDER_ID,
        re.compile(r"(?<!\w)#(\d{4,12})\b"),
        1, lambda s: f"#{s.strip()}",
    ),

    # ── Ticket references ──────────────────────────────────────────────────────
    # Matches: TKT-123, TICKET-123, ticket #123, ticket number 123
    (
        EntityType.TICKET_REF,
        re.compile(r"\b(TKT[-_]?\d{3,10})\b", re.I),
        1, _upper,
    ),
    (
        EntityType.TICKET_REF,
        re.compile(r"\bticket\s+(?:number\s+|#\s*|num\s+)?(\d{3,10})\b", re.I),
        1, lambda s: f"TKT-{s.strip()}",
    ),

    # ── Account IDs ───────────────────────────────────────────────────────────
    # Matches: ACCT-123, account #123, account number 123
    (
        EntityType.ACCOUNT_ID,
        re.compile(r"\b(ACCT[-_]?\d{3,12})\b", re.I),
        1, _upper,
    ),
    (
        EntityType.ACCOUNT_ID,
        re.compile(r"\baccount\s+(?:number\s+|#\s*|id\s*:?\s*|num\s+)?(\d{3,12})\b", re.I),
        1, lambda s: f"ACCT-{s.strip()}",
    ),

    # ── Email addresses ───────────────────────────────────────────────────────
    (
        EntityType.EMAIL,
        re.compile(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b"),
        1, _lower,
    ),

    # ── Monetary amounts ──────────────────────────────────────────────────────
    # Matches: $99, $99.99, €100, £50, 99 dollars, 99 USD, 99.99 EUR
    (
        EntityType.AMOUNT,
        re.compile(r"([$€£¥₹]\s*\d+(?:[.,]\d{1,2})?)\b"),
        1, _strip,
    ),
    (
        EntityType.AMOUNT,
        re.compile(r"\b(\d+(?:[.,]\d{1,2})?)\s*(dollars?|USD|EUR|GBP|euros?|pounds?|INR)\b", re.I),
        0, _strip,
    ),

    # ── Dates — explicit ──────────────────────────────────────────────────────
    # Matches: January 5, Jan 5, 2024, 05/01/2024, 2024-01-05
    (
        EntityType.DATE,
        re.compile(
            r"\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
            r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
            r"\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\b",
            re.I,
        ),
        1, _strip,
    ),
    (
        EntityType.DATE,
        re.compile(r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b"),
        1, _strip,
    ),
    (
        EntityType.DATE,
        re.compile(r"\b(\d{4}-\d{2}-\d{2})\b"),
        1, _strip,
    ),

    # ── Dates — relative ─────────────────────────────────────────────────────
    # Matches: yesterday, last week, 3 days ago, this morning, etc.
    (
        EntityType.DATE,
        re.compile(
            r"\b(yesterday|today|last\s+(?:week|month|year|monday|tuesday|wednesday|"
            r"thursday|friday|saturday|sunday)|this\s+(?:morning|afternoon|evening|week|month)|"
            r"\d+\s+(?:days?|weeks?|months?)\s+ago|earlier\s+today|just\s+now|recently)\b",
            re.I,
        ),
        1, _lower,
    ),

    # ── Product names ─────────────────────────────────────────────────────────
    # Matches: "product XYZ", quoted names, common product reference patterns
    (
        EntityType.PRODUCT,
        re.compile(r'(?:product|item|plan|package|feature)\s+"([^"]{2,60})"', re.I),
        1, _strip,
    ),
    (
        EntityType.PRODUCT,
        re.compile(r'"([A-Z][A-Za-z0-9\s\-\.]{2,40})"'),
        1, _strip,
    ),
]


# ── Extractor ─────────────────────────────────────────────────────────────────

class EntityExtractor:
    """
    Extracts structured entities from a message using regex patterns.
    Fully synchronous — no I/O, no LLM calls.

    extract() deduplicates matches so the same value is never returned twice
    for the same entity type.
    """

    def extract(self, message: str) -> EntityResult:
        """
        Run all entity rules against the message and return deduplicated results.
        Never raises.
        """
        seen: set[tuple[str, str]] = set()   # (entity_type, value) dedupe set
        entities: list[Entity] = []

        for entity_type, pattern, group_idx, normaliser in _ENTITY_RULES:
            for match in pattern.finditer(message):
                try:
                    raw = match.group(group_idx) if group_idx > 0 else match.group(0)
                    value = normaliser(raw)

                    key = (entity_type.value, value)
                    if key in seen:
                        continue
                    seen.add(key)

                    entities.append(Entity(
                        entity_type=entity_type,
                        value=value,
                        raw_match=match.group(0),
                    ))
                except Exception:
                    continue   # Silently skip malformed matches

        return EntityResult(entities=entities)


# ── Module-level singleton ────────────────────────────────────────────────────
entity_extractor = EntityExtractor()
