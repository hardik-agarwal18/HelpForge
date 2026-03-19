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
  },
  providerGuards: {
    timeoutMs: toNumber(process.env.AI_PROVIDER_TIMEOUT_MS, 15000),
    retries: toNumber(process.env.AI_PROVIDER_RETRIES, 3),
    retryDelayMs: toNumber(process.env.AI_PROVIDER_RETRY_DELAY_MS, 500),
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
