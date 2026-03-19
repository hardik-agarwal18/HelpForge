export const buildAITicketSummaryCacheKey = (ticketId) =>
  `ai:ticket:${ticketId}:summary`;

export const buildAITicketSuggestionCacheKey = (ticketId) =>
  `ai:ticket:${ticketId}:suggestion`;

export const buildAIAgentStatsCacheKey = (agentId, days) =>
  `ai:agent:${agentId}:stats:${days}`;

export const buildAICommentProcessedCacheKey = (commentId) =>
  `ai:comment:${commentId}:processed`;

export const buildAICommentProcessingLockKey = (commentId) =>
  `ai:comment:${commentId}:processing`;

export default {
  buildAITicketSummaryCacheKey,
  buildAITicketSuggestionCacheKey,
  buildAIAgentStatsCacheKey,
  buildAICommentProcessedCacheKey,
  buildAICommentProcessingLockKey,
};
