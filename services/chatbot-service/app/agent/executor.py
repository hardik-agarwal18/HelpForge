"""
Tool Executor
──────────────
Central tool registry and execution engine for the unified agent layer.

Responsibilities:
  • Maintain a registry of all available tools (name → BaseTool instance)
  • Track per-tool runtime status (ACTIVE / DISABLED / DEGRADED)
  • Provide available_tool_descriptions() for system prompt injection —
    shows status + cost so the LLM makes informed, cost-aware decisions
  • Execute tools with retry logic (retriable errors only)
  • Enforce per-run tool call limits (MAX_TOOL_CALLS_PER_RUN)
  • Block execution of DISABLED tools immediately (no retry)

Design principle: the executor is the ONLY place that runs tool code.
The agent calls executor.execute() and receives a plain dict back.
"""
from __future__ import annotations

import asyncio
import logging
from enum import Enum
from typing import Any, Dict, Optional, Set

from app.agent.tools.base import BaseTool, ToolExecutionError

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS_PER_RUN = 3   # Hard limit per agent run (also checked in agent.py)
MAX_RETRIES = 2               # Retries for retriable ToolExecutionError
RETRY_DELAY_SECONDS = 0.5     # Delay between retries (doubles each attempt)


class ToolStatus(str, Enum):
    """
    Runtime availability state for each registered tool.

      ACTIVE   — healthy, use freely
      DEGRADED — working but slow/unreliable; prefer alternatives if available
      DISABLED — do not call; executor rejects immediately without retry
    """
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    DISABLED = "DISABLED"


class ToolExecutor:
    """
    Registry and execution engine for agent tools.

    Usage:
        executor = ToolExecutor()
        executor.register(CreateTicketTool())
        executor.set_tool_status("assign_agent", ToolStatus.DISABLED)

        descriptions = executor.available_tool_descriptions()  # inject into prompt
        result = await executor.execute("create_ticket", {...})
    """

    def __init__(self) -> None:
        self._registry: Dict[str, BaseTool] = {}
        self._statuses: Dict[str, ToolStatus] = {}
        self._call_count: int = 0  # Resets per agent run via reset_call_count()

    # ── Registration ──────────────────────────────────────────────────────

    def register(self, tool: BaseTool) -> None:
        """Register a tool. Default status: ACTIVE."""
        if tool.name in self._registry:
            raise ValueError(f"Tool '{tool.name}' is already registered")
        self._registry[tool.name] = tool
        self._statuses[tool.name] = ToolStatus.ACTIVE
        logger.debug("Registered tool: %s (cost=%s)", tool.name, tool.cost.value)

    def register_many(self, tools: list[BaseTool]) -> None:
        for tool in tools:
            self.register(tool)

    # ── Status management ─────────────────────────────────────────────────

    def set_tool_status(self, tool_name: str, status: ToolStatus) -> None:
        """
        Update the runtime status of a registered tool.
        Called by health checks, feature flags, or circuit breakers.
        """
        if tool_name not in self._registry:
            raise ValueError(f"Unknown tool: '{tool_name}'")
        old = self._statuses.get(tool_name, ToolStatus.ACTIVE)
        self._statuses[tool_name] = status
        if old != status:
            logger.info("Tool status changed: %s → %s", tool_name, status.value)

    def get_tool_status(self, tool_name: str) -> ToolStatus:
        return self._statuses.get(tool_name, ToolStatus.ACTIVE)

    def disable_tool(self, tool_name: str) -> None:
        self.set_tool_status(tool_name, ToolStatus.DISABLED)

    def enable_tool(self, tool_name: str) -> None:
        self.set_tool_status(tool_name, ToolStatus.ACTIVE)

    @property
    def registered_names(self) -> Set[str]:
        return set(self._registry.keys())

    @property
    def active_tool_names(self) -> Set[str]:
        """Names of tools that are currently ACTIVE or DEGRADED (callable)."""
        return {
            name for name, status in self._statuses.items()
            if status != ToolStatus.DISABLED
        }

    # ── Prompt rendering ──────────────────────────────────────────────────

    def available_tool_descriptions(self) -> str:
        """
        Returns a formatted multi-line string of all tools with their
        current status and cost tier, ready to inject into the system prompt.

        Example output:
          - create_ticket(subject, description, priority): Create a new ticket  [✓ ACTIVE] [cost:MEDIUM]
          - assign_agent(ticket_id, agent_id): Assign to agent  [⚠ DEGRADED] [cost:LOW]
          - classify_ticket(ticket_id): Classify ticket  [✗ DISABLED] [cost:HIGH]

        The LLM must NEVER call a DISABLED tool.
        It may call DEGRADED tools but should prefer alternatives.
        """
        if not self._registry:
            return "(no tools registered)"
        lines = []
        for name, tool in self._registry.items():
            status = self._statuses.get(name, ToolStatus.ACTIVE)
            lines.append(tool.to_prompt_description(status=status.value))
        return "\n".join(lines)

    # ── Dry run simulation ────────────────────────────────────────────────

    def simulate(
        self,
        tool_name: str,
        tool_input: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Return a realistic mock result for `tool_name` without executing it.

        Used exclusively in dry run mode — the agent's reasoning pipeline
        runs for real (real LLM calls) but tool side-effects are skipped.
        The mock includes the actual input fields so the trace is meaningful.
        """
        tool = self._registry.get(tool_name)
        if tool is None:
            return {
                "success": False,
                "error": f"Unknown tool: '{tool_name}'",
                "simulated": True,
            }

        status = self._statuses.get(tool_name, ToolStatus.ACTIVE)
        if status == ToolStatus.DISABLED:
            return {
                "success": False,
                "error": f"Tool '{tool_name}' is DISABLED",
                "tool_status": "DISABLED",
                "simulated": True,
            }

        # Build a realistic mock based on the tool name and actual inputs
        ticket_id = tool_input.get("ticket_id", "[dry-run-ticket]")
        org_id = tool_input.get("org_id", "[dry-run-org]")

        mocks: Dict[str, Dict[str, Any]] = {
            "create_ticket": {
                "success": True,
                "ticket_id": "DRY-RUN-001",
                "ticket": {
                    "id": "DRY-RUN-001",
                    "subject": tool_input.get("subject", "[simulated]"),
                    "status": "OPEN",
                    "priority": tool_input.get("priority", "MEDIUM"),
                },
            },
            "update_ticket": {
                "success": True,
                "ticket_id": ticket_id,
                "updated_fields": [k for k in tool_input if k not in ("ticket_id", "org_id")],
                "ticket": {"id": ticket_id, "status": tool_input.get("status", "OPEN")},
            },
            "fetch_ticket": {
                "success": True,
                "ticket": {
                    "id": ticket_id,
                    "org_id": org_id,
                    "subject": "[simulated ticket subject]",
                    "status": "OPEN",
                    "priority": "MEDIUM",
                    "comments": [{"role": "user", "content": "[simulated comment]"}],
                },
            },
            "assign_agent": {
                "success": True,
                "ticket_id": ticket_id,
                "assigned_to": tool_input.get("agent_id", "[simulated-agent-id]"),
                "result": {"status": "IN_PROGRESS"},
            },
            "escalate_ticket": {
                "success": True,
                "ticket_id": ticket_id,
                "urgency": tool_input.get("urgency", "NORMAL"),
                "result": {"escalated": True, "notified": True},
            },
            "search_docs": {
                "success": True,
                "query": tool_input.get("query", "[query]"),
                "result_count": 3,
                "results": [
                    {"excerpt": "[Simulated doc 1] — relevant knowledge base article"},
                    {"excerpt": "[Simulated doc 2] — related FAQ entry"},
                    {"excerpt": "[Simulated doc 3] — troubleshooting guide"},
                ],
                "context": "[Simulated RAG context — 3 documents found]",
            },
            "summarize_ticket": {
                "success": True,
                "ticket_id": ticket_id,
                "summary": (
                    "[Simulated summary] User reported an issue. "
                    "Multiple troubleshooting steps attempted. Resolution pending."
                ),
            },
            "classify_ticket": {
                "success": True,
                "ticket_id": ticket_id,
                "category": "Technical",
                "sub_category": "Bug Report",
                "severity": "MEDIUM",
                "classification": {"confidence": 0.87},
            },
        }

        result = mocks.get(tool_name, {"success": True, "simulated": True, "tool": tool_name})
        result["simulated"] = True
        result["_dry_run"] = True
        return result

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
        Execute a registered, non-disabled tool with retry logic.

        Returns a plain dict:
          Success: {"success": True, ...tool-specific fields...}
          Failure: {"success": False, "error": "...", "retriable": bool}

        Never raises — all exceptions are returned as error dicts.
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

        # ── Guard: tool availability ───────────────────────────────────────
        status = self._statuses.get(tool_name, ToolStatus.ACTIVE)
        if status == ToolStatus.DISABLED:
            logger.warning("Blocked call to DISABLED tool: '%s'", tool_name)
            return {
                "success": False,
                "error": f"Tool '{tool_name}' is currently DISABLED — choose an active tool",
                "retriable": False,
                "tool_status": "DISABLED",
            }
        if status == ToolStatus.DEGRADED:
            logger.warning("Calling DEGRADED tool: '%s' — proceeding with caution", tool_name)

        # ── Execute with retry ─────────────────────────────────────────────
        last_error: Optional[ToolExecutionError] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                self._call_count += 1
                result = await tool.execute(tool_input)
                logger.info(
                    "Tool executed: tool=%s attempt=%d success=True cost=%s",
                    tool_name, attempt + 1, tool.cost.value,
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

def _build_executor() -> ToolExecutor:
    """Instantiate executor and register all tools."""
    from app.agent.tools import all_tools  # late import avoids circular deps
    from app.agent.validator import agent_validator

    ex = ToolExecutor()
    ex.register_many(all_tools)

    # Inform the validator of active tool names so it can reject DISABLED refs
    agent_validator.update_tool_names(ex.registered_names)
    agent_validator.update_active_tools(ex.active_tool_names)

    logger.info(
        "ToolExecutor built: %d tools registered — %s",
        len(ex.registered_names),
        sorted(ex.registered_names),
    )
    return ex


tool_executor = _build_executor()
