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
        """
        Returns (messages, system_prompt) for the post-tool decision call.

        Asks for a FULL JSON decision — the agent loop decides whether to
        execute another tool, respond with an AI comment, or escalate.
        """
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

        step = tool_result.pop("_step", "?")
        success = tool_result.get("success", False)
        tool_result_text = truncate_to_tokens(str(tool_result), _TOOL_RESULT_TOKEN_BUDGET)

        if success:
            outcome_note = f"✓ Tool succeeded (step {step})"
        else:
            error = tool_result.get("error", "unknown error")
            outcome_note = f"✗ Tool failed (step {step}): {error}"

        messages: List[Dict[str, str]] = [
            {
                "role": "user",
                "content": (
                    f"Ticket event:\n{event_description}\n\n"
                    f"You executed tool '{decision.tool}'.\n"
                    f"{outcome_note}\n"
                    f"Result: {tool_result_text}\n\n"
                    "Analyze this result and decide your NEXT action:\n"
                    "  • If the action resolved the ticket → action=respond, write the AI comment\n"
                    "  • If another tool is needed → action=tool_call (prefer low-cost tools)\n"
                    "  • If the tool failed or you cannot proceed → action=escalate\n"
                    "  • NEVER call a DISABLED tool.\n\n"
                    "Respond ONLY with valid JSON."
                ),
            }
        ]
        return messages, system_prompt
