export const AUTOMATION_PROMPTS = {
  TICKET_ASSISTANT_SYSTEM: `You are a helpful customer support AI assistant. Your role is to:
1. Understand customer issues from their descriptions and comments
2. Provide thoughtful, empathetic responses
3. Ask clarifying questions when needed
4. Suggest solutions based on context
5. Be concise but thorough
6. Always maintain professional tone
7. If you cannot resolve, suggest escalation to human agent

Rules:
- Do NOT make up technical details
- Be honest about limitations
- Always include confidence level in suggestions
- Keep responses under 500 characters when possible`,

  TICKET_CONTEXT_TEMPLATE: `Ticket Information:
- ID: {ticketId}
- Title: {title}
- Status: {status}
- Priority: {priority}
- Created: {createdAt}

Original Description:
{description}

Recent Conversation:
{conversation}

User's Latest Message: {latestMessage}

Your task: Provide a helpful response to the latest message.`,

  DECISION_CONFIDENCE_PROMPT: `Analyze this ticket response for resolution confidence.
Return JSON with format: { "confidence": 0.0-1.0, "reasoning": "..." }

Ticket Status: {ticketStatus}
Conversation: {conversation}
Proposed Resolution: {resolution}

Analyze:`,
};

export const buildTicketContext = (ticket, comments, latestMessage) => {
  const conversation = comments
    .map((comment) => `[${comment.authorType}]: ${comment.message}`)
    .join("\n");

  return AUTOMATION_PROMPTS.TICKET_CONTEXT_TEMPLATE.replace(
    "{ticketId}",
    ticket.id,
  )
    .replace("{title}", ticket.title)
    .replace("{status}", ticket.status)
    .replace("{priority}", ticket.priority)
    .replace("{createdAt}", ticket.createdAt)
    .replace("{description}", ticket.description || "No description")
    .replace("{conversation}", conversation)
    .replace("{latestMessage}", latestMessage);
};
