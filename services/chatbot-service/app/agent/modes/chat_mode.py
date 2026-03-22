"""
Chat Mode Handler
──────────────────
Builds the LLM message list for CHAT mode agent decisions.

Responsibilities:
  • Pull RAG context from the pipeline (or use pre-provided context)
  • Load conversation history from Redis memory
  • Build the system prompt using the chat prompt template
  • Build the follow-up message after tool execution
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from app.agent.prompts.chat_prompt import build_chat_system_prompt
from app.agent.schema import AgentContext, AgentDecision, AgentInput
from app.agent.utils import (
    format_history,
    format_ticket_context,
    truncate_to_tokens,
)

logger = logging.getLogger(__name__)

# Token budgets for context injection (approximate)
_RAG_TOKEN_BUDGET = 1_800
_HISTORY_TOKEN_BUDGET = 800
_TOOL_RESULT_TOKEN_BUDGET = 400


class ChatMode:
    """
    Context builder for CHAT mode.

    Called by the agent to:
      1. build_messages() → first LLM call (decide action)
      2. build_followup_messages() → second LLM call (response after tool run)
    """

    def build_messages(
        self,
        inp: AgentInput,
        ctx: AgentContext,
        tool_descriptions: str,
    ) -> Tuple[List[Dict[str, str]], str]:
        """
        Returns (messages, system_prompt) ready for gateway_client.generate().
        """
        system_prompt = build_chat_system_prompt(
            ticket_context=format_ticket_context(inp.ticket_context),
            rag_context=truncate_to_tokens(ctx.rag_context_text, _RAG_TOKEN_BUDGET),
            history=truncate_to_tokens(
                format_history(ctx.history), _HISTORY_TOKEN_BUDGET
            ),
            tool_descriptions=tool_descriptions,
        )

        messages: List[Dict[str, str]] = [
            {
                "role": "user",
                "content": (
                    f"User message: {inp.query}\n\n"
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
        """
        Returns (messages, system_prompt) for the second LLM call that
        produces the final user-facing response after a tool execution.
        """
        system_prompt = build_chat_system_prompt(
            ticket_context=format_ticket_context(inp.ticket_context),
            rag_context=truncate_to_tokens(ctx.rag_context_text, _RAG_TOKEN_BUDGET),
            history=truncate_to_tokens(
                format_history(ctx.history), _HISTORY_TOKEN_BUDGET
            ),
            tool_descriptions=tool_descriptions,
        )

        tool_result_text = truncate_to_tokens(
            f"Tool '{decision.tool}' result: {tool_result}", _TOOL_RESULT_TOKEN_BUDGET
        )

        messages: List[Dict[str, str]] = [
            {
                "role": "user",
                "content": (
                    f"User message: {inp.query}\n\n"
                    f"You already executed: {decision.tool}\n"
                    f"{tool_result_text}\n\n"
                    "Now write the final response for the user. "
                    "Respond ONLY with valid JSON."
                ),
            }
        ]
        return messages, system_prompt
