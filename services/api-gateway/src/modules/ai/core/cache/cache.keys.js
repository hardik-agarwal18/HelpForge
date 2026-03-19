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

export const buildAITicketUsageCacheKey = (ticketId) =>
  `ai:usage:ticket:${ticketId}`;

export const buildAIOrganizationUsageCacheKey = (organizationId) =>
  `ai:usage:organization:${organizationId}`;

export default {
  buildAITicketSummaryCacheKey,
  buildAITicketSuggestionCacheKey,
  buildAIAgentStatsCacheKey,
  buildAICommentProcessedCacheKey,
  buildAICommentProcessingLockKey,
  buildAITicketUsageCacheKey,
  buildAIOrganizationUsageCacheKey,
};
