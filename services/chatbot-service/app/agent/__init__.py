"""
Unified Agent Layer
────────────────────
Central AI decision engine powering three modes:
  • CHAT       — user conversations (replaces direct RAG pipeline)
  • AUTOMATION — event-driven decisions (ticket comment triggers)
  • AUGMENTATION — suggestions for human agents

Entry point: from app.agent import unified_agent
"""
from app.agent.agent import unified_agent

__all__ = ["unified_agent"]
