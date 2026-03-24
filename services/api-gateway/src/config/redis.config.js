import IORedis from "ioredis";
import config from "./index.js";
import logger from "./logger.js";

// ── Configuration ────────────────────────────────────────────────────────────

const SERVICE_NAME = "api-gateway";
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 500;
const MAX_RETRY_DELAY_MS = 30_000;
const CONNECT_TIMEOUT_MS = config.redis.connectTimeoutMs;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

const CB_FAILURE_THRESHOLD = config.redis.circuitBreaker.failureThreshold;
const CB_RESET_TIMEOUT_MS = config.redis.circuitBreaker.resetTimeoutMs;

const MAX_CONNECTIONS = config.redis.maxConnections;

// ── Circuit Breaker ──────────────────────────────────────────────────────────

const isInfrastructureError = (error) => {
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("econnreset") ||
    msg.includes("closed")
  );
};

function createCircuitBreaker(role) {
  let state = "CLOSED";
  let failures = 0;
  let lastFailureTime = 0;

  return {
    get state() {
      return state;
    },

    canExecute() {
      if (state === "CLOSED") return true;
      if (
        state === "OPEN" &&
        Date.now() - lastFailureTime >= CB_RESET_TIMEOUT_MS
      ) {
        state = "HALF_OPEN";
        logger.info(
          { service: SERVICE_NAME, role },
          "Redis circuit breaker half-open — allowing probe",
        );
        return true;
      }
      return state === "HALF_OPEN";
    },

    recordSuccess() {
      if (state !== "CLOSED") {
        logger.info(
          { service: SERVICE_NAME, role, previousState: state },
          "Redis circuit breaker closed",
        );
      }
      failures = 0;
      state = "CLOSED";
    },

    recordFailure(error) {
      if (!isInfrastructureError(error)) return;
      failures++;
      lastFailureTime = Date.now();
      if (failures >= CB_FAILURE_THRESHOLD && state !== "OPEN") {
        state = "OPEN";
        logger.error(
          {
            service: SERVICE_NAME,
            role,
            failures,
            cooldownMs: CB_RESET_TIMEOUT_MS,
          },
          "Redis circuit breaker opened — pausing operations",
        );
      }
    },
  };
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function createRedisMetrics() {
  let commandCount = 0;
  let errorCount = 0;
  let samples = [];
  const MAX_SAMPLES = 1000;
  const circuitState = { cache: "CLOSED", queue: "CLOSED" };

  return {
    command(ms) {
      commandCount++;
      samples.push(ms);
      if (samples.length > MAX_SAMPLES) {
        samples = samples.slice(-MAX_SAMPLES);
      }
    },
    error(ms) {
      commandCount++;
      errorCount++;
      samples.push(ms);
      if (samples.length > MAX_SAMPLES) {
        samples = samples.slice(-MAX_SAMPLES);
      }
    },
    circuit(role, s) {
      circuitState[role] = s;
    },

    snapshot() {
      const sorted = [...samples].sort((a, b) => a - b);
      const len = sorted.length;
      const sum = len ? samples.reduce((a, b) => a + b, 0) : 0;
      return {
        redis_commands: commandCount,
        redis_errors: errorCount,
        redis_latency_avg_ms: len ? Math.round(sum / len) : 0,
        redis_latency_p50_ms: len ? sorted[Math.floor(len * 0.5)] : 0,
        redis_latency_p95_ms: len ? sorted[Math.floor(len * 0.95)] : 0,
        redis_latency_p99_ms: len ? sorted[Math.floor(len * 0.99)] : 0,
        redis_circuit_breaker: { ...circuitState },
        redis_active_connections: registry.size,
        redis_max_connections: MAX_CONNECTIONS,
        redis_clients: [...registry.keys()],
      };
    },
  };
}

const metrics = createRedisMetrics();

// ── Instrumented Proxy ───────────────────────────────────────────────────────

const PASSTHROUGH_PROPS = new Set([
  "on",
  "once",
  "emit",
  "removeListener",
  "removeAllListeners",
  "addListener",
  "listeners",
  "listenerCount",
  "connect",
  "disconnect",
  "quit",
  "status",
  "options",
  "condition",
  "duplicate",
]);

function instrumentClient(rawClient, role, breaker) {
  return new Proxy(rawClient, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (
        typeof prop === "symbol" ||
        typeof value !== "function" ||
        PASSTHROUGH_PROPS.has(prop) ||
        prop.startsWith("_")
      ) {
        return value;
      }

      return function (...args) {
        if (!breaker.canExecute()) {
          metrics.circuit(role, breaker.state);
          return Promise.reject(
            new Error(`Redis circuit breaker OPEN (${role})`),
          );
        }

        const start = Date.now();
        try {
          const result = value.apply(target, args);

          if (result && typeof result.then === "function") {
            return result.then(
              (res) => {
                metrics.command(Date.now() - start);
                breaker.recordSuccess();
                metrics.circuit(role, breaker.state);
                return res;
              },
              (err) => {
                metrics.error(Date.now() - start);
                breaker.recordFailure(err);
                metrics.circuit(role, breaker.state);
                throw err;
              },
            );
          }

          // Sync return (pipeline(), multi())
          return result;
        } catch (err) {
          metrics.error(Date.now() - start);
          breaker.recordFailure(err);
          metrics.circuit(role, breaker.state);
          throw err;
        }
      };
    },
  });
}

// ── Connection Registry ──────────────────────────────────────────────────────

const registry = new Map();

function trackConnection(name, client) {
  registry.set(name, client);

  client.on("end", () => {
    registry.delete(name);
  });

  const total = registry.size;
  if (total > MAX_CONNECTIONS) {
    logger.error(
      {
        service: SERVICE_NAME,
        activeConnections: total,
        maxConnections: MAX_CONNECTIONS,
        clients: [...registry.keys()],
      },
      "Redis connection limit exceeded — risk of resource exhaustion",
    );
  } else if (total > Math.floor(MAX_CONNECTIONS * 0.8)) {
    logger.warn(
      {
        service: SERVICE_NAME,
        activeConnections: total,
        maxConnections: MAX_CONNECTIONS,
      },
      "Redis connections approaching limit",
    );
  }
}

// ── Client Factory (internal) ────────────────────────────────────────────────

function buildClient(clientName) {
  if (!config.redis.url) {
    logger.warn(
      { service: SERVICE_NAME },
      "REDIS_URL not set, Redis client not created",
    );
    return null;
  }

  if (registry.has(clientName)) {
    logger.warn(
      { service: SERVICE_NAME, redisClient: clientName },
      "Redis client already exists — returning existing connection",
    );
    return registry.get(clientName);
  }

  if (registry.size >= MAX_CONNECTIONS) {
    logger.error(
      {
        service: SERVICE_NAME,
        redisClient: clientName,
        activeConnections: registry.size,
        maxConnections: MAX_CONNECTIONS,
        clients: [...registry.keys()],
      },
      "Redis connection refused — max connections reached",
    );
    return null;
  }

  const log = logger.child({ service: SERVICE_NAME, redisClient: clientName });

  const client = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy(times) {
      if (times > MAX_RETRIES) {
        log.error(
          { attempts: times },
          "Redis max retries exhausted — all pending commands will reject",
        );
        return null;
      }
      const delay = Math.min(
        RETRY_BASE_MS * Math.pow(2, times - 1),
        MAX_RETRY_DELAY_MS,
      );
      log.warn({ attempt: times, nextRetryMs: delay }, "Redis retry scheduled");
      return delay;
    },
  });

  client.on("connect", () => log.info("Redis socket connected"));
  client.on("ready", () => log.info("Redis client ready"));
  client.on("reconnecting", (delay) =>
    log.warn({ delayMs: delay }, "Redis reconnecting"),
  );
  client.on("close", () => log.warn("Redis connection closed"));
  client.on("end", () =>
    log.error(
      "Redis connection ended permanently — client will not reconnect",
    ),
  );
  client.on("error", (error) =>
    log.error({ error: error.message }, "Redis error"),
  );

  trackConnection(clientName, client);

  return client;
}

// ── Role-specific Clients ────────────────────────────────────────────────────

let cacheClientRaw = null;
let cacheClientProxy = null;
let queueConnection = null;

const cacheBreaker = createCircuitBreaker("cache");

/**
 * Shared cache client — instrumented with circuit breaker + metrics.
 * For GET/SET/DEL/HINCRBYFLOAT, trace persistence, etc.
 */
const getCacheClient = () => {
  if (cacheClientProxy) return cacheClientProxy;

  cacheClientRaw = buildClient("cache");
  if (!cacheClientRaw) return null;

  cacheClientProxy = instrumentClient(cacheClientRaw, "cache", cacheBreaker);
  return cacheClientProxy;
};

/**
 * Shared queue producer connection — NOT instrumented (BullMQ manages itself).
 */
const getQueueConnection = () => {
  if (queueConnection) return queueConnection;

  queueConnection = buildClient("queue");
  return queueConnection;
};

/**
 * Dedicated BullMQ worker connection — NOT instrumented.
 * Each worker needs its own connection per BullMQ requirements.
 */
const createWorkerConnection = (workerName = "worker") => {
  return buildClient(`worker:${workerName}`);
};

/**
 * Eagerly connect cache + queue clients. Call before starting workers.
 * Resolves once both are ready (or logs warnings if REDIS_URL is unset).
 */
const connectRedis = async () => {
  const results = [];

  const cache = getCacheClient();
  if (cache && cacheClientRaw?.status !== "ready") {
    results.push(
      cacheClientRaw
        .connect()
        .then(() => logger.info({ service: SERVICE_NAME }, "Redis cache connected"))
        .catch((err) => {
          logger.error({ service: SERVICE_NAME, error: err.message }, "Redis cache connect failed");
        }),
    );
  }

  const queue = getQueueConnection();
  if (queue && queue.status !== "ready") {
    results.push(
      queue
        .connect()
        .then(() => logger.info({ service: SERVICE_NAME }, "Redis queue connected"))
        .catch((err) => {
          logger.error({ service: SERVICE_NAME, error: err.message }, "Redis queue connect failed");
        }),
    );
  }

  await Promise.all(results);
};

// ── Backward Compatibility ───────────────────────────────────────────────────

const getSharedBullmqConnection = getQueueConnection;
const createRedisClient = createWorkerConnection;

// ── Health Check ─────────────────────────────────────────────────────────────

const redisHealthCheck = async () => {
  const check = async (client, role) => {
    if (!client) return { connected: false, latencyMs: null };

    const start = Date.now();
    try {
      const result = await Promise.race([
        client.ping(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Redis PING timed out")),
            HEALTH_CHECK_TIMEOUT_MS,
          ),
        ),
      ]);
      return { connected: result === "PONG", latencyMs: Date.now() - start };
    } catch (error) {
      logger.warn(
        { service: SERVICE_NAME, role, error: error.message },
        "Redis health check failed",
      );
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  };

  const [cache, queue] = await Promise.all([
    check(cacheClientRaw, "cache"),
    check(queueConnection, "queue"),
  ]);

  return { cache, queue };
};

// ── Metrics Export ───────────────────────────────────────────────────────────

const getRedisMetrics = () => metrics.snapshot();

// ── Graceful Shutdown ────────────────────────────────────────────────────────

const disconnectRedis = async () => {
  const errors = [];
  const names = [...registry.keys()];

  for (const name of names) {
    const client = registry.get(name);
    if (!client) continue;
    try {
      await client.quit();
      logger.info(
        { service: SERVICE_NAME, redisClient: name },
        `Redis disconnected (${name})`,
      );
    } catch (error) {
      logger.error(
        { service: SERVICE_NAME, redisClient: name, error: error.message },
        `Redis disconnect failed (${name})`,
      );
      errors.push(error);
    }
  }

  registry.clear();
  cacheClientRaw = null;
  cacheClientProxy = null;
  queueConnection = null;

  if (errors.length > 0) {
    throw new AggregateError(errors, "Failed to disconnect Redis clients");
  }
};

export {
  connectRedis,
  getCacheClient,
  getQueueConnection,
  createWorkerConnection,
  redisHealthCheck,
  getRedisMetrics,
  disconnectRedis,
  // Backward compatibility
  createRedisClient,
  getSharedBullmqConnection,
};

export default {
  connectRedis,
  getCacheClient,
  getQueueConnection,
  createWorkerConnection,
  redisHealthCheck,
  getRedisMetrics,
  disconnectRedis,
  createRedisClient,
  getSharedBullmqConnection,
};
