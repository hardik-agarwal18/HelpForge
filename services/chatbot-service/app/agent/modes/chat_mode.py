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
        Returns (messages, system_prompt) for the post-tool decision LLM call.

        IMPORTANT — this asks for a FULL JSON decision, not just a final response.
        The agent loop inspects the new decision and may:
          • action=respond   → produce final user message (loop ends)
          • action=tool_call → execute another tool (loop continues)
          • action=escalate  → hand off to human (loop ends)

        This is what makes the tool execution a true reasoning loop rather than
        a one-shot "format the result" step.
        """
        system_prompt = build_chat_system_prompt(
            ticket_context=format_ticket_context(inp.ticket_context),
            rag_context=truncate_to_tokens(ctx.rag_context_text, _RAG_TOKEN_BUDGET),
            history=truncate_to_tokens(
                format_history(ctx.history), _HISTORY_TOKEN_BUDGET
            ),
            tool_descriptions=tool_descriptions,
        )

        step = tool_result.pop("_step", "?")  # injected by agent.py for logging
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
                    f"User message: {inp.query}\n\n"
                    f"You executed tool '{decision.tool}'.\n"
                    f"{outcome_note}\n"
                    f"Result: {tool_result_text}\n\n"
                    "Analyze this result and decide your NEXT action:\n"
                    "  • If the result resolves the user's issue → action=respond, write the final message\n"
                    "  • If another tool is needed → action=tool_call with the next tool\n"
                    "  • If the tool failed and you cannot recover → action=escalate\n"
                    "  • Prefer low-cost tools for follow-up actions.\n"
                    "  • NEVER call a DISABLED tool.\n\n"
                    "Respond ONLY with valid JSON."
                ),
            }
        ]
        return messages, system_prompt
