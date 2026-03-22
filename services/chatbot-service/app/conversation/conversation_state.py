"""
Conversation State
───────────────────
Tracks the full lifecycle of a conversation — which stage it's in, what the
user has asked, what entities have been collected, and how many turns have
passed without resolution.

Storage
────────
State is persisted as JSON in Redis using the same TTL as ticket memory:

  Key: conv:state:{org_id}:{ticket_id}
  TTL: settings.memory_ttl_seconds (default 24 h)

Isolation: every key is namespaced by org_id — cross-tenant access is
structurally impossible (same isolation guarantee as TicketMemory).

Conversation stages
────────────────────
  OPENING        → Turn 1–2.  Greeting / initial message.
  GATHERING      → Turn 3+.  Collecting details (what happened? order ID?).
  INVESTIGATING  → Clear intent + entities known. Agent is working on it.
  RESOLVING      → Agent took a concrete action (tool_call or confident respond).
  CLOSING        → User satisfied / compliment / natural wrap-up.

Stage transitions happen in update() after each agent turn — the current
stage is always the state at the START of the turn so the agent sees where
the conversation is right now, not where it's going next.

Updating state
───────────────
Call update() after the agent produces a decision.  It:
  1. Increments turn count.
  2. Appends intent to intent_history (capped at 20 entries).
  3. Merges new entities into entity_map (deduplicating values per type).
  4. Appends severity to severity_history (capped at 20 entries).
  5. Tracks unresolved_turns (resets when agent action=respond).
  6. Advances stage according to transition rules.
  7. Persists back to Redis.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import redis.asyncio as aioredis
from pydantic import BaseModel, Field

from app.config.settings import settings

logger = logging.getLogger(__name__)

# Maximum history list lengths stored in Redis per ticket
_MAX_HISTORY = 20


# ── Conversation stage ────────────────────────────────────────────────────────

class ConversationStage(str, Enum):
    OPENING       = "opening"        # First 1-2 turns
    GATHERING     = "gathering"      # Collecting information
    INVESTIGATING = "investigating"  # Working on the problem
    RESOLVING     = "resolving"      # Applying a solution
    CLOSING       = "closing"        # Natural wrap-up


# ── State model ───────────────────────────────────────────────────────────────

class ConversationState(BaseModel):
    """
    Full conversation state snapshot.  Serialised as JSON to Redis.
    All fields have safe defaults so a missing key never causes a crash.
    """

    stage: ConversationStage = ConversationStage.OPENING

    # Turn counter (incremented on every update() call)
    turn_count: int = 0

    # Chronological log of detected intents (last _MAX_HISTORY entries)
    intent_history: list[str] = Field(default_factory=list)

    # Accumulated entities across ALL turns: {"order_id": ["ORD-123", …], …}
    entity_map: dict[str, list[str]] = Field(default_factory=dict)

    # Chronological log of sentiment severity labels (last _MAX_HISTORY entries)
    severity_history: list[str] = Field(default_factory=list)

    # How many consecutive turns have passed without the agent issuing a
    # "respond" decision — used by escalation_detector and stage transitions
    unresolved_turns: int = 0

    # Convenience accessors (populated from intent_history)
    last_intent: Optional[str] = None

    # ISO-8601 timestamp of the last update
    last_updated: str = ""


# ── State store ───────────────────────────────────────────────────────────────

class ConversationStateStore:
    """
    Redis-backed persistence for ConversationState objects.

    All public methods are async (Redis I/O).  The stage advancement logic
    (_advance_stage) is pure-synchronous and fully testable without Redis.
    """

    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    # ── Key builder ───────────────────────────────────────────────────────────

    def _key(self, org_id: str, ticket_id: str) -> str:
        return f"conv:state:{org_id}:{ticket_id}"

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_or_create(
        self,
        org_id: str,
        ticket_id: str,
    ) -> ConversationState:
        """
        Load existing state from Redis.  Returns a fresh default state if
        the key does not exist or the stored JSON is corrupt.
        Never raises.
        """
        try:
            raw = await self.redis.get(self._key(org_id, ticket_id))
            if raw:
                return ConversationState.model_validate_json(raw)
        except Exception as exc:
            logger.warning(
                "Failed to load conv state org=%s ticket=%s: %s — using default",
                org_id, ticket_id, exc,
            )
        return ConversationState()

    async def update(
        self,
        org_id: str,
        ticket_id: str,
        *,
        intent: str,
        entities: dict[str, list[str]],
        severity: str,
        agent_action: str,
    ) -> ConversationState:
        """
        Persist one turn's worth of changes.

        Parameters
        ──────────
        intent        Intent label from IntentDetector (e.g. "refund_request")
        entities      Entity map from EntityExtractor (e.g. {"order_id": ["ORD-1"]})
        severity      Severity label from EscalationDetector ("calm", "frustrated", …)
        agent_action  Action from AgentDecision ("respond", "tool_call", "escalate", "suggest")

        Returns the updated ConversationState.  Never raises.
        """
        try:
            state = await self.get_or_create(org_id, ticket_id)
            state = self._apply_turn(state, intent, entities, severity, agent_action)
            await self._persist(org_id, ticket_id, state)
            return state
        except Exception as exc:
            logger.warning(
                "Failed to update conv state org=%s ticket=%s: %s",
                org_id, ticket_id, exc,
            )
            return ConversationState()

    async def clear(self, org_id: str, ticket_id: str) -> None:
        """Delete conversation state (e.g. when ticket is closed)."""
        try:
            await self.redis.delete(self._key(org_id, ticket_id))
        except Exception as exc:
            logger.warning("Failed to clear conv state: %s", exc)

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    # ── Internal: apply one turn ──────────────────────────────────────────────

    @staticmethod
    def _apply_turn(
        state: ConversationState,
        intent: str,
        entities: dict[str, list[str]],
        severity: str,
        agent_action: str,
    ) -> ConversationState:
        """
        Pure function — mutates a copy of state and returns it.
        All the state-transition logic lives here so it can be unit-tested
        without Redis.
        """
        # 1. Increment turn counter
        state.turn_count += 1

        # 2. Append intent to history (capped)
        state.intent_history.append(intent)
        if len(state.intent_history) > _MAX_HISTORY:
            state.intent_history = state.intent_history[-_MAX_HISTORY:]
        state.last_intent = intent

        # 3. Merge new entities (deduplicate values per type)
        for etype, values in entities.items():
            existing = state.entity_map.setdefault(etype, [])
            for v in values:
                if v not in existing:
                    existing.append(v)

        # 4. Append severity history (capped)
        state.severity_history.append(severity)
        if len(state.severity_history) > _MAX_HISTORY:
            state.severity_history = state.severity_history[-_MAX_HISTORY:]

        # 5. Track unresolved turns
        if agent_action == "respond":
            state.unresolved_turns = 0
        else:
            state.unresolved_turns += 1

        # 6. Advance stage
        has_new_entities = bool(entities)
        state.stage = ConversationStateStore._advance_stage(
            state, has_new_entities, agent_action
        )

        # 7. Timestamp
        state.last_updated = datetime.now(timezone.utc).isoformat()

        return state

    @staticmethod
    def _advance_stage(
        state: ConversationState,
        has_new_entities: bool,
        agent_action: str,
    ) -> ConversationStage:
        """
        Stage transition rules.  Called after every update.

        The rules are intentionally conservative — they advance forward but
        never move backward.  A RESOLVING conversation that suddenly gets a
        new COMPLAINT intent stays in RESOLVING (the agent handles it).
        """
        current = state.stage
        turn = state.turn_count
        intent = state.last_intent or "general"

        if current == ConversationStage.OPENING:
            # After 2 turns, we're past the greeting phase
            if turn >= 2:
                return ConversationStage.GATHERING

        elif current == ConversationStage.GATHERING:
            # We have enough signal to start investigating when:
            #   • New entities arrived (order ID, email, etc.)
            #   • Intent is clearly actionable (not just small talk)
            actionable_intents = {
                "refund_request", "billing", "technical_support",
                "status_check", "cancellation", "complaint",
            }
            if has_new_entities or intent in actionable_intents:
                return ConversationStage.INVESTIGATING

        elif current == ConversationStage.INVESTIGATING:
            # Advance to RESOLVING when the agent took a concrete action
            if agent_action in ("tool_call", "respond") and state.unresolved_turns == 0:
                return ConversationStage.RESOLVING

        elif current == ConversationStage.RESOLVING:
            # Move to CLOSING when the user seems satisfied
            satisfaction_intents = {"compliment", "general"}
            if intent in satisfaction_intents and turn >= 3:
                return ConversationStage.CLOSING

        return current

    # ── Persistence ───────────────────────────────────────────────────────────

    async def _persist(
        self,
        org_id: str,
        ticket_id: str,
        state: ConversationState,
    ) -> None:
        key = self._key(org_id, ticket_id)
        await self.redis.setex(
            key,
            settings.memory_ttl_seconds,
            state.model_dump_json(),
        )


# ── Module-level singleton ────────────────────────────────────────────────────
conv_state_store = ConversationStateStore()
