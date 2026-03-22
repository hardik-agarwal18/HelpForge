"""
Agent Tools — public registry export.
Import all_tools to register every tool with the executor.
"""
from app.agent.tools.assign_agent import AssignAgentTool
from app.agent.tools.base import BaseTool, ToolExecutionError
from app.agent.tools.classify_ticket import ClassifyTicketTool
from app.agent.tools.create_ticket import CreateTicketTool
from app.agent.tools.escalate_ticket import EscalateTicketTool
from app.agent.tools.fetch_ticket import FetchTicketTool
from app.agent.tools.search_docs import SearchDocsTool
from app.agent.tools.summarize_ticket import SummarizeTicketTool
from app.agent.tools.update_ticket import UpdateTicketTool

# Ordered list used for executor registration and prompt description rendering
all_tools: list[BaseTool] = [
    CreateTicketTool(),
    UpdateTicketTool(),
    FetchTicketTool(),
    AssignAgentTool(),
    EscalateTicketTool(),
    SearchDocsTool(),
    SummarizeTicketTool(),
    ClassifyTicketTool(),
]

__all__ = [
    "BaseTool",
    "ToolExecutionError",
    "all_tools",
    "CreateTicketTool",
    "UpdateTicketTool",
    "FetchTicketTool",
    "AssignAgentTool",
    "EscalateTicketTool",
    "SearchDocsTool",
    "SummarizeTicketTool",
    "ClassifyTicketTool",
]
