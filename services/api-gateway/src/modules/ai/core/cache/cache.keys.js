export const buildAITicketSummaryCacheKey = (ticketId) =>
  `ai:ticket:${ticketId}:summary`;

export const buildAITicketSuggestionCacheKey = (ticketId) =>
  `ai:ticket:${ticketId}:suggestion`;

export const buildAIAgentStatsCacheKey = (agentId, days) =>
  `ai:agent:${agentId}:stats:${days}`;

export default {
  buildAITicketSummaryCacheKey,
  buildAITicketSuggestionCacheKey,
  buildAIAgentStatsCacheKey,
};
