"""
Automation Mode Handler
────────────────────────
Builds the LLM message list for AUTOMATION mode agent decisions.

Responsibilities:
  • Format the triggering event as a structured query
  • Load recent ticket comments as history
  • Build the system prompt with event + ticket context
  • Build the follow-up message after tool execution
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from app.agent.prompts.automation_prompt import build_automation_system_prompt
from app.agent.schema import AgentContext, AgentDecision, AgentInput
from app.agent.utils import (
    format_history,
    format_ticket_context,
    truncate_to_tokens,
)

logger = logging.getLogger(__name__)

_RAG_TOKEN_BUDGET = 1_200
_HISTORY_TOKEN_BUDGET = 1_000
_TOOL_RESULT_TOKEN_BUDGET = 400


class AutomationMode:
    """Context builder for AUTOMATION mode."""

    def build_messages(
        self,
        inp: AgentInput,
        ctx: AgentContext,
        tool_descriptions: str,
    ) -> Tuple[List[Dict[str, str]], str]:
        """Returns (messages, system_prompt) for the first decision LLM call."""

        # The triggering event is passed in inp.extra["event_type"] + inp.query
        event_type = inp.extra.get("event_type", "ticket_event")
        event_description = f"Event type: {event_type}\nDescription: {inp.query}"

        system_prompt = build_automation_system_prompt(
            ticket_context=format_ticket_context(inp.ticket_context),
            rag_context=truncate_to_tokens(ctx.rag_context_text, _RAG_TOKEN_BUDGET),
            event_description=event_description,
            history=truncate_to_tokens(
                format_history(ctx.history, max_messages=15), _HISTORY_TOKEN_BUDGET
            ),
            tool_descriptions=tool_descriptions,
        )

        messages: List[Dict[str, str]] = [
            {
                "role": "user",
                "content": (
                    f"Ticket event received:\n{event_description}\n\n"
                    "Analyze the ticket and decide the best action. "
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
        """Returns (messages, system_prompt) for the post-tool follow-up call."""
        event_type = inp.extra.get("event_type", "ticket_event")
        event_description = f"Event type: {event_type}\nDescription: {inp.query}"

        system_prompt = build_automation_system_prompt(
            ticket_context=format_ticket_context(inp.ticket_context),
            rag_context=truncate_to_tokens(ctx.rag_context_text, _RAG_TOKEN_BUDGET),
            event_description=event_description,
            history=truncate_to_tokens(
                format_history(ctx.history, max_messages=15), _HISTORY_TOKEN_BUDGET
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
                    f"Ticket event:\n{event_description}\n\n"
                    f"Tool executed: {decision.tool}\n"
                    f"{tool_result_text}\n\n"
                    "Now decide the final action and write the AI comment for the ticket. "
                    "Respond ONLY with valid JSON."
                ),
            }
        ]
        return messages, system_prompt
