"""
Tool Executor
──────────────
Central tool registry and execution engine for the unified agent layer.

Responsibilities:
  • Maintain a registry of all available tools (name → BaseTool instance)
  • Provide a formatted tool-description string for system prompt injection
  • Execute tools with retry logic (up to MAX_RETRIES for retriable errors)
  • Enforce per-run tool call limits (MAX_TOOL_CALLS_PER_RUN)
  • Catch ToolExecutionError and return structured error dicts (never raises)

Design principle: the executor is the ONLY place that runs tool code.
The agent calls executor.execute() and receives a plain dict back.
It never imports tool classes directly.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Set

from app.agent.tools.base import BaseTool, ToolExecutionError

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS_PER_RUN = 3   # Hard limit per agent run
MAX_RETRIES = 2               # Retries for retriable ToolExecutionError
RETRY_DELAY_SECONDS = 0.5     # Delay between retries (doubles each attempt)


class ToolExecutor:
    """
    Registry and execution engine for agent tools.

    Usage:
        executor = ToolExecutor()
        executor.register(CreateTicketTool())
        ...
        result = await executor.execute("create_ticket", {...})
        descriptions = executor.tool_descriptions()
    """

    def __init__(self) -> None:
        self._registry: Dict[str, BaseTool] = {}
        self._call_count: int = 0  # Resets per agent run via reset_call_count()

    # ── Registration ──────────────────────────────────────────────────────

    def register(self, tool: BaseTool) -> None:
        """Register a tool. Raises ValueError if name is already taken."""
        if tool.name in self._registry:
            raise ValueError(f"Tool '{tool.name}' is already registered")
        self._registry[tool.name] = tool
        logger.debug("Registered tool: %s", tool.name)

    def register_many(self, tools: list[BaseTool]) -> None:
        for tool in tools:
            self.register(tool)

    @property
    def registered_names(self) -> Set[str]:
        return set(self._registry.keys())

    # ── Prompt rendering ──────────────────────────────────────────────────

    def tool_descriptions(self) -> str:
        """
        Returns a formatted multi-line string of all tool one-liners,
        ready to inject into the system prompt.
        """
        if not self._registry:
            return "(no tools registered)"
        return "\n".join(
            tool.to_prompt_description()
            for tool in self._registry.values()
        )

    # ── Execution ─────────────────────────────────────────────────────────

    def reset_call_count(self) -> None:
        """Reset per-run call counter. Called at the start of each agent run."""
        self._call_count = 0

    async def execute(
        self,
        tool_name: str,
        tool_input: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a registered tool by name with retry logic.

        Returns:
            A plain dict with at minimum:
              {"success": bool, ...tool-specific fields...}
            On failure:
              {"success": False, "error": "...", "retriable": bool}

        Never raises — all exceptions are caught and returned as error dicts.
        """
        # ── Guard: max calls per run ───────────────────────────────────────
        if self._call_count >= MAX_TOOL_CALLS_PER_RUN:
            logger.warning(
                "Tool call limit reached (%d/%d): skipping '%s'",
                self._call_count, MAX_TOOL_CALLS_PER_RUN, tool_name,
            )
            return {
                "success": False,
                "error": f"Tool call limit ({MAX_TOOL_CALLS_PER_RUN}) reached for this run",
                "retriable": False,
            }

        # ── Guard: tool exists ─────────────────────────────────────────────
        tool: Optional[BaseTool] = self._registry.get(tool_name)
        if tool is None:
            logger.error("Unknown tool requested: '%s'", tool_name)
            return {
                "success": False,
                "error": f"Unknown tool: '{tool_name}'",
                "retriable": False,
            }

        # ── Execute with retry ─────────────────────────────────────────────
        last_error: Optional[ToolExecutionError] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                self._call_count += 1
                result = await tool.execute(tool_input)
                logger.info(
                    "Tool executed: tool=%s attempt=%d success=True",
                    tool_name, attempt + 1,
                )
                return result

            except ToolExecutionError as exc:
                last_error = exc
                logger.warning(
                    "Tool error: tool=%s attempt=%d retriable=%s reason=%s",
                    tool_name, attempt + 1, exc.retriable, exc.reason,
                )
                if not exc.retriable or attempt == MAX_RETRIES:
                    break
                await asyncio.sleep(RETRY_DELAY_SECONDS * (2 ** attempt))

            except Exception as exc:
                # Unexpected exception — wrap and stop immediately
                logger.exception("Unexpected error in tool '%s': %s", tool_name, exc)
                return {
                    "success": False,
                    "error": f"Unexpected error: {exc}",
                    "retriable": False,
                }

        return {
            "success": False,
            "error": last_error.reason if last_error else "Unknown error",
            "retriable": last_error.retriable if last_error else False,
        }


# ── Module-level singleton ────────────────────────────────────────────────────
# Built once at import time; populated by _build_executor() below.

def _build_executor() -> ToolExecutor:
    """Instantiate executor and register all tools."""
    from app.agent.tools import all_tools  # late import avoids circular deps
    from app.agent.validator import agent_validator

    ex = ToolExecutor()
    ex.register_many(all_tools)

    # Inform the validator of registered tool names so it can catch bad tool refs
    agent_validator.update_tool_names(ex.registered_names)

    logger.info("ToolExecutor built with %d tools: %s", len(ex.registered_names), sorted(ex.registered_names))
    return ex


tool_executor = _build_executor()
