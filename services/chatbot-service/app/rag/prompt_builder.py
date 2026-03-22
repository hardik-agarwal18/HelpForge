"""
Prompt Builder
───────────────
Constructs the messages list and system prompt sent to the LLM.

Two modes:
  support — customer-facing chatbot
  agent   — internal assistant helping a human support agent
"""

from typing import Any

from app.config.settings import settings

# ─── System prompt templates ─────────────────────────────────────────────────

_SUPPORT_SYSTEM = """\
You are a helpful customer support AI assistant for {org_name}.

You have access to relevant documentation excerpts and the full ticket
conversation history to resolve the customer's issue.

Guidelines:
- Be concise, clear, and empathetic
- Reference specific documentation when available
- Never fabricate information — say "I'm not sure" rather than guess
- If the issue requires a human agent, say so clearly

Ticket context:
- Ticket ID : {ticket_id}
- Priority  : {priority}
- Category  : {category}
"""

_AGENT_SYSTEM = """\
You are an AI assistant helping a support agent handle ticket #{ticket_id}.

Provide concise, actionable reply suggestions that the agent can send directly
or adapt.  Include documentation references where relevant.

Customer sentiment : {sentiment}
Ticket priority    : {priority}
"""


class PromptBuilder:
    # ── System prompt ─────────────────────────────────────────────────────────

    def build_system_prompt(
        self,
        ticket_context: dict[str, Any],
        mode: str = "support",
    ) -> str:
        if mode == "agent":
            return _AGENT_SYSTEM.format(
                ticket_id=ticket_context.get("ticket_id", ""),
                sentiment=ticket_context.get("sentiment", "neutral"),
                priority=ticket_context.get("priority", "MEDIUM"),
            )

        return _SUPPORT_SYSTEM.format(
            org_name=ticket_context.get("org_name", "our company"),
            ticket_id=ticket_context.get("ticket_id", ""),
            priority=ticket_context.get("priority", "MEDIUM"),
            category=ticket_context.get("category", "General"),
        )

    # ── RAG context block ─────────────────────────────────────────────────────

    def build_rag_context(
        self,
        retrieved_docs: list[dict[str, Any]],
    ) -> str:
        """
        Convert Qdrant hits into a formatted context block.
        Only surfaces chunks above the configured score threshold.
        """
        high_quality = [
            d for d in retrieved_docs if d["score"] >= settings.min_retrieval_score
        ]
        if not high_quality:
            return ""

        lines = ["=== RELEVANT DOCUMENTATION ==="]
        for i, doc in enumerate(high_quality, 1):
            payload = doc["payload"]
            source = payload.get("source", f"Document {i}")
            text = payload.get("text", "")
            lines.append(f"\n[Source {i}: {source}]\n{text}")

        return "\n".join(lines)

    # ── Message list ──────────────────────────────────────────────────────────

    def build_messages(
        self,
        conversation_history: list[dict[str, Any]],
        current_message: str,
        rag_context: str,
    ) -> list[dict[str, str]]:
        """
        Assemble the messages array for the LLM API call.

        History messages are included as-is.  The current user message is
        augmented with the RAG context block prepended so the model can
        reference it when formulating the reply.
        """
        messages = [
            {"role": m["role"], "content": m["content"]}
            for m in conversation_history
        ]

        user_content = (
            f"{rag_context}\n\n=== CUSTOMER MESSAGE ===\n{current_message}"
            if rag_context
            else current_message
        )
        messages.append({"role": "user", "content": user_content})
        return messages


prompt_builder = PromptBuilder()
