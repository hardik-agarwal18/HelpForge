"""
Augmentation Mode Handler
──────────────────────────
Builds the LLM message list for AUGMENTATION mode — a human support agent
is actively working a ticket and asking the AI for suggestions.

Key difference from chat mode:
  • The "user" is a support agent, not a customer.
  • The AI always returns suggestions, never autonomous tool executions.
  • RAG context is presented as "knowledge base articles" not "answers".
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from app.agent.prompts.augmentation_prompt import build_augmentation_system_prompt
from app.agent.schema import AgentContext, AgentDecision, AgentInput
from app.agent.utils import (
    format_history,
    format_ticket_context,
    truncate_to_tokens,
)

logger = logging.getLogger(__name__)

_RAG_TOKEN_BUDGET = 2_000   # Augmentation benefits from more doc context
_HISTORY_TOKEN_BUDGET = 800
_TOOL_RESULT_TOKEN_BUDGET = 400


class AugmentationMode:
    """Context builder for AUGMENTATION mode."""

    def build_messages(
        self,
        inp: AgentInput,
        ctx: AgentContext,
        tool_descriptions: str,
    ) -> Tuple[List[Dict[str, str]], str]:
        """Returns (messages, system_prompt) for the first decision LLM call."""
        agent_id = inp.extra.get("agent_id", "")
        agent_query = inp.query

        system_prompt = build_augmentation_system_prompt(
            ticket_context=format_ticket_context(inp.ticket_context),
            rag_context=truncate_to_tokens(ctx.rag_context_text, _RAG_TOKEN_BUDGET),
            history=truncate_to_tokens(
                format_history(ctx.history), _HISTORY_TOKEN_BUDGET
            ),
            agent_query=agent_query,
            tool_descriptions=tool_descriptions,
        )

        messages: List[Dict[str, str]] = [
            {
                "role": "user",
                "content": (
                    f"Support agent{' ' + agent_id if agent_id else ''} asks: {agent_query}\n\n"
                    "Provide a specific, actionable suggestion. "
                    "Respond ONLY with valid JSON."
                ),
            }
        ]
        return messages, system_prompt

    def build_followup_messages(
        self,
        inp: AgentInput,
        ctx: AgentContext,
        decision: AgentDecision,
        tool_result: Dict[str, Any],
        tool_descriptions: str,
    ) -> Tuple[List[Dict[str, str]], str]:
        """Augmentation mode never executes tools — this is a no-op fallback."""
        logger.warning(
            "Augmentation mode received tool_result unexpectedly; "
            "falling back to build_messages()"
        )
        return self.build_messages(inp, ctx, tool_descriptions)
