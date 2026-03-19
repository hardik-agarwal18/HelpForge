const formatTicketAge = (createdAt) => {
  const now = Date.now();
  const age = now - createdAt.getTime();

  const hours = Math.floor(age / 3600000);
  const minutes = Math.floor((age % 3600000) / 60000);

  if (hours > 24) {
    return `${Math.floor(hours / 24)} day(s)`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
};

export const buildAgentContext = (ticket, lastUserComment) => {
  const comments = ticket.comments
    .map(
      (comment) =>
        `[${comment.createdAt.toLocaleTimeString()}] ${comment.authorType}: ${comment.message}`,
    )
    .join("\n");

  return `
AGENT CONTEXT - Ticket #${ticket.id}
====================================
Customer: ${ticket.createdBy?.email || "unknown"}
Priority: ${ticket.priority}
Status: ${ticket.status}
Duration: ${formatTicketAge(ticket.createdAt)}

Issue Summary:
${ticket.description}

Recent Conversation:
${comments}

Last User Message:
${lastUserComment.message}

Your task as agent:
1. Understand the exact problem and attempted solutions
2. Provide clear, actionable next step
3. Be empathetic but professional
4. If unsure, ask clarifying questions
5. Suggest workarounds if resolution isn't immediately available
`;
};

export const getAgentSystemPrompt = () => {
  return `You are helping a support agent respond to a customer.
Your suggestions should be:
- Professional and empathetic
- Clear and actionable
- Concise (2-3 sentences ideal)
- Include next steps or expectations
- Acknowledge previous attempts
- Use simple technical language

Format your response as a complete message the agent can send to the customer.
The agent can customize it before sending.`;
};
