"""
Conversation Intelligence Engine
──────────────────────────────────
Provides per-turn understanding of the user journey across four dimensions:

  IntentDetector        — What does the user WANT right now?
                          (complaint / refund_request / billing / technical_support /
                           status_check / cancellation / info_request / compliment / general)

  EntityExtractor       — What structured data did they provide?
                          (order_id / ticket_ref / account_id / email / amount / date / product)

  ConversationState     — Where is this conversation in its lifecycle?
                          (opening → gathering → investigating → resolving → closing)
                          Persisted in Redis; survives across multiple chat messages.

  EscalationDetector    — Should we escalate to a human agent RIGHT NOW?
                          Detects anger, frustration loops, abusive language, explicit
                          human-agent requests, and long unresolved conversations.

Typical call sequence (in chat_service.py)
───────────────────────────────────────────
  1.  state  = await conv_state_store.get_or_create(org_id, ticket_id)
  2.  intent = await intent_detector.detect(org_id, message)
  3.  entities = entity_extractor.extract(message)
  4.  escalation = escalation_detector.detect(message, state, intent)

  Pre-agent gate:
  5.  if escalation.should_escalate → return early with escalation response

  Enrich agent context:
  6.  ticket_context.update({
          "conv_intent":          intent.intent.value,
          "conv_stage":           state.stage.value,
          "conv_severity":        escalation.severity.value,
          "conv_turn":            state.turn_count + 1,
          "conv_entities":        entities.entity_map,
          "conv_unresolved_turns": state.unresolved_turns,
      })

  Post-agent:
  7.  await conv_state_store.update(
          org_id, ticket_id,
          intent=intent.intent.value,
          entities=entities.entity_map,
          severity=escalation.severity.value,
          agent_action=decision.action.value,
      )
"""

from app.conversation.conversation_state import (
    ConversationStage,
    ConversationState,
    ConversationStateStore,
    conv_state_store,
)
from app.conversation.entity_extractor import (
    Entity,
    EntityExtractor,
    EntityResult,
    EntityType,
    entity_extractor,
)
from app.conversation.escalation_detector import (
    EscalationDetector,
    EscalationSignal,
    Severity,
    escalation_detector,
)
from app.conversation.intent_detector import (
    Intent,
    IntentDetector,
    IntentResult,
    intent_detector,
)

__all__ = [
    # Intent
    "Intent",
    "IntentDetector",
    "IntentResult",
    "intent_detector",
    # Entities
    "Entity",
    "EntityExtractor",
    "EntityResult",
    "EntityType",
    "entity_extractor",
    # Conversation state
    "ConversationStage",
    "ConversationState",
    "ConversationStateStore",
    "conv_state_store",
    # Escalation
    "EscalationDetector",
    "EscalationSignal",
    "Severity",
    "escalation_detector",
]
