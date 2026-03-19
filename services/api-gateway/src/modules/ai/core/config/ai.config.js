const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const aiConfig = {
  provider: process.env.AI_PROVIDER || "openai",
  model: process.env.AI_MODEL || "gpt-4.1-mini",
  openAiApiKey: process.env.OPENAI_API_KEY,
  automation: {
    queueName: process.env.AI_AUTOMATION_QUEUE_NAME || "ai-automation",
    processCommentJobName:
      process.env.AI_AUTOMATION_PROCESS_COMMENT_JOB_NAME ||
      "process-ticket-comment",
    retryLimit: toNumber(process.env.AI_AUTOMATION_RETRY_LIMIT, 3),
    retryBackoffMs: toNumber(process.env.AI_AUTOMATION_RETRY_BACKOFF_MS, 1000),
    dlqKey: process.env.AI_AUTOMATION_DLQ_KEY || "ai-automation:dlq",
    dlqMaxEntries: toNumber(process.env.AI_AUTOMATION_DLQ_MAX_ENTRIES, 1000),
    idempotencyTtlSeconds: toNumber(
      process.env.AI_AUTOMATION_IDEMPOTENCY_TTL_SECONDS,
      604800,
    ),
    processingLockTtlSeconds: toNumber(
      process.env.AI_AUTOMATION_PROCESSING_LOCK_TTL_SECONDS,
      300,
    ),
  },
  providerGuards: {
    timeoutMs: toNumber(process.env.AI_PROVIDER_TIMEOUT_MS, 15000),
    retries: toNumber(process.env.AI_PROVIDER_RETRIES, 3),
    retryDelayMs: toNumber(process.env.AI_PROVIDER_RETRY_DELAY_MS, 500),
  },
  usage: {
    promptCostPer1kTokens: toNumber(
      process.env.AI_PROMPT_COST_PER_1K_TOKENS,
      0.00015,
    ),
    completionCostPer1kTokens: toNumber(
      process.env.AI_COMPLETION_COST_PER_1K_TOKENS,
      0.0006,
    ),
  },
  cache: {
    enabled: process.env.AI_CACHE_ENABLED !== "false",
    ttlSeconds: toNumber(process.env.AI_CACHE_TTL_SECONDS, 300),
  },
  monitoring: {
    enabled: process.env.AI_MONITORING_ENABLED !== "false",
    traceSamplingRate: toNumber(process.env.AI_TRACE_SAMPLING_RATE, 1),
  },
};

export default aiConfig;
