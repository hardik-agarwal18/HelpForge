import dotenv from "dotenv";

dotenv.config();

const toInt = (val, fallback) => {
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNum = (val, fallback) => {
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isTest = process.env.NODE_ENV === "test";

const required = (val, name) => {
  if (!val && !isTest) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
};

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL,

  server: {
    requestTimeoutMs: toInt(process.env.REQUEST_TIMEOUT_MS, 30_000),
    shutdownTimeoutMs: toInt(process.env.SHUTDOWN_TIMEOUT_MS, 15_000),
  },

  database: {
    url: required(process.env.DATABASE_URL, "DATABASE_URL"),
    readUrl: process.env.DATABASE_READ_URL,
    testUrl: process.env.DATABASE_URL_TEST,
    poolSize: toInt(process.env.DB_POOL_SIZE, 10),
    poolTimeout: toInt(process.env.DB_POOL_TIMEOUT, 20),
    circuitBreaker: {
      failureThreshold: toInt(process.env.DB_CB_FAILURE_THRESHOLD, 5),
      resetTimeoutMs: toInt(process.env.DB_CB_RESET_TIMEOUT_MS, 30_000),
    },
  },

  redis: {
    url: process.env.REDIS_URL,
    connectTimeoutMs: toInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10_000),
    maxConnections: toInt(process.env.REDIS_MAX_CONNECTIONS, 10),
    circuitBreaker: {
      failureThreshold: toInt(process.env.REDIS_CB_FAILURE_THRESHOLD, 5),
      resetTimeoutMs: toInt(process.env.REDIS_CB_RESET_TIMEOUT_MS, 30_000),
    },
  },

  jwtSecret: required(process.env.JWT_SECRET, "JWT_SECRET"),
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || required(process.env.JWT_SECRET, "JWT_SECRET"),
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),

  services: {
    chatbot: process.env.CHATBOT_SERVICE_URL,
    notification: process.env.NOTIFICATION_SERVICE_URL,
  },

  kafka: {
    broker: process.env.KAFKA_BROKER,
  },

  internal: {
    serviceToken: process.env.INTERNAL_SERVICE_TOKEN,
    hmacEnabled: process.env.INTERNAL_HMAC_ENABLED !== "false",
  },

  ai: {
    provider: process.env.AI_PROVIDER || "openai",
    model: process.env.AI_MODEL || "gpt-4.1-mini",
    openAiApiKey: process.env.OPENAI_API_KEY,
    automation: {
      queueName: process.env.AI_AUTOMATION_QUEUE_NAME || "ai-automation",
      processCommentJobName:
        process.env.AI_AUTOMATION_PROCESS_COMMENT_JOB_NAME ||
        "process-ticket-comment",
      retryLimit: toNum(process.env.AI_AUTOMATION_RETRY_LIMIT, 3),
      retryBackoffMs: toNum(process.env.AI_AUTOMATION_RETRY_BACKOFF_MS, 1000),
      dlqMaxEntries: toNum(process.env.AI_AUTOMATION_DLQ_MAX_ENTRIES, 1000),
      idempotencyTtlSeconds: toNum(
        process.env.AI_AUTOMATION_IDEMPOTENCY_TTL_SECONDS,
        604800,
      ),
      processingLockTtlSeconds: toNum(
        process.env.AI_AUTOMATION_PROCESSING_LOCK_TTL_SECONDS,
        300,
      ),
    },
    providerGuards: {
      timeoutMs: toNum(process.env.AI_PROVIDER_TIMEOUT_MS, 15000),
      retries: toNum(process.env.AI_PROVIDER_RETRIES, 3),
      retryDelayMs: toNum(process.env.AI_PROVIDER_RETRY_DELAY_MS, 500),
    },
    usage: {
      promptCostPer1kTokens: toNum(
        process.env.AI_PROMPT_COST_PER_1K_TOKENS,
        0.00015,
      ),
      completionCostPer1kTokens: toNum(
        process.env.AI_COMPLETION_COST_PER_1K_TOKENS,
        0.0006,
      ),
    },
    cache: {
      enabled: process.env.AI_CACHE_ENABLED !== "false",
      ttlSeconds: toNum(process.env.AI_CACHE_TTL_SECONDS, 300),
    },
    monitoring: {
      enabled: process.env.AI_MONITORING_ENABLED !== "false",
      traceSamplingRate: toNum(process.env.AI_TRACE_SAMPLING_RATE, 1),
    },
  },

  scraper: {
    workerConcurrency: toInt(process.env.SCRAPER_WORKER_CONCURRENCY, 3),
    cacheTtlSeconds: toInt(process.env.SCRAPER_CACHE_TTL_SECONDS, 86_400),
    cleanupCron: process.env.SCRAPER_CLEANUP_CRON ?? "0 2 * * *",
    retentionDays: toInt(process.env.SCRAPER_RETENTION_DAYS, 30),
    freshnessTtlMs: toInt(
      process.env.SCRAPER_FRESHNESS_TTL_MS,
      24 * 60 * 60 * 1_000,
    ),
    maxPageBytes: toInt(
      process.env.SCRAPER_MAX_PAGE_BYTES,
      5 * 1_024 * 1_024,
    ),
    fetchTimeoutMs: toInt(process.env.SCRAPER_FETCH_TIMEOUT_MS, 15_000),
    puppeteer: {
      enabled: process.env.SCRAPER_PUPPETEER_ENABLED === "true",
      timeoutMs: toInt(process.env.SCRAPER_PUPPETEER_TIMEOUT_MS, 30_000),
      thinWordThreshold: toInt(process.env.SCRAPER_THIN_WORD_THRESHOLD, 50),
    },
  },
};

export default Object.freeze(config);
