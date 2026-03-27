import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import config from "./index.js";
import logger from "./logger.js";

// ── Configuration ────────────────────────────────────────────────────────────

const SERVICE_NAME = "api-gateway";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const CONNECT_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const SLOW_QUERY_THRESHOLD_MS = 1_000;

const CB_FAILURE_THRESHOLD = config.database.circuitBreaker.failureThreshold;
const CB_RESET_TIMEOUT_MS = config.database.circuitBreaker.resetTimeoutMs;

const POOL_SIZE = config.database.poolSize;
const POOL_TIMEOUT = config.database.poolTimeout;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Request Context (tracing / requestId propagation) ────────────────────────
//
// Usage in Express middleware:
//   import { requestContext } from "./config/database.config.js";
//   app.use((req, res, next) => {
//     requestContext.run({ requestId: req.id }, next);
//   });

export const requestContext = new AsyncLocalStorage();

// ── Circuit Breaker ──────────────────────────────────────────────────────────

const isInfrastructureError = (error) => {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "P1001" || // can't reach database
    code === "P1002" || // database timed out
    code === "P1008" || // operations timed out
    code === "P1017" || // server closed connection
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound")
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
          "Circuit breaker half-open — allowing probe request",
        );
        return true;
      }
      return state === "HALF_OPEN";
    },

    recordSuccess() {
      if (state !== "CLOSED") {
        logger.info(
          { service: SERVICE_NAME, role, previousState: state },
          "Circuit breaker closed",
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
          "Circuit breaker opened — pausing DB requests",
        );
      }
    },
  };
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function createMetrics() {
  let connectSuccess = 0;
  let connectFailure = 0;
  let queryCount = 0;
  let queryErrors = 0;
  let samples = [];
  const MAX_SAMPLES = 1000;
  const healthStatus = { write: null, read: null };
  const circuitState = { write: "CLOSED", read: "CLOSED" };

  return {
    connectOk() {
      connectSuccess++;
    },
    connectFail() {
      connectFailure++;
    },
    query(ms, err) {
      queryCount++;
      if (err) queryErrors++;
      samples.push(ms);
      if (samples.length > MAX_SAMPLES) {
        samples = samples.slice(-MAX_SAMPLES);
      }
    },
    health(role, ok) {
      healthStatus[role] = ok;
    },
    circuit(role, s) {
      circuitState[role] = s;
    },

    snapshot() {
      const sorted = [...samples].sort((a, b) => a - b);
      const len = sorted.length;
      const sum = len ? samples.reduce((a, b) => a + b, 0) : 0;
      return {
        db_connect_success: connectSuccess,
        db_connect_failure: connectFailure,
        db_query_count: queryCount,
        db_query_errors: queryErrors,
        db_query_avg_ms: len ? Math.round(sum / len) : 0,
        db_query_p50_ms: len ? sorted[Math.floor(len * 0.5)] : 0,
        db_query_p95_ms: len ? sorted[Math.floor(len * 0.95)] : 0,
        db_query_p99_ms: len ? sorted[Math.floor(len * 0.99)] : 0,
        db_health_status: { ...healthStatus },
        db_circuit_breaker: { ...circuitState },
      };
    },
  };
}

// ── URL Builder (pool tuning) ────────────────────────────────────────────────

const getDatabaseUrl = (role) => {
  let base;
  if (config.nodeEnv === "test") {
    base = config.database.testUrl;
  } else if (role === "read") {
    base = config.database.readUrl || config.database.url;
  } else {
    base = config.database.url;
  }

  if (!base) return base;

  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connection_limit=${POOL_SIZE}&pool_timeout=${POOL_TIMEOUT}`;
};

// ── Retry with Timeout ───────────────────────────────────────────────────────

const connectWithRetry = async (client, role, metrics) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await Promise.race([
        client.$connect(),
        sleep(CONNECT_TIMEOUT_MS).then(() => {
          throw new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS}ms`);
        }),
      ]);
      metrics.connectOk();
      logger.info(
        { service: SERVICE_NAME, environment: config.nodeEnv, role },
        `SQL database connected (${role})`,
      );
      return;
    } catch (error) {
      metrics.connectFail();
      if (attempt === MAX_RETRIES) {
        logger.error(
          {
            service: SERVICE_NAME,
            error: error.message,
            attempts: attempt,
            role,
          },
          `Failed to connect (${role}) after all retries`,
        );
        throw error;
      }
      logger.warn(
        {
          service: SERVICE_NAME,
          error: error.message,
          attempt,
          maxRetries: MAX_RETRIES,
          role,
        },
        `Connection attempt failed (${role}), retrying`,
      );
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }
};

// ── Prisma Middleware (circuit breaker + metrics + tracing) ───────────────────

const attachMiddleware = (client, role, breaker, metrics) => {
  client.$use(async (params, next) => {
    if (!breaker.canExecute()) {
      metrics.circuit(role, breaker.state);
      throw new Error(
        `Circuit breaker OPEN for ${role} database — requests temporarily paused`,
      );
    }

    const ctx = requestContext.getStore();
    const requestId = ctx?.requestId;
    const start = Date.now();

    try {
      const result = await next(params);
      const ms = Date.now() - start;

      breaker.recordSuccess();
      metrics.query(ms);
      metrics.circuit(role, breaker.state);

      if (ms > SLOW_QUERY_THRESHOLD_MS) {
        logger.warn(
          {
            service: SERVICE_NAME,
            role,
            model: params.model,
            action: params.action,
            durationMs: ms,
            requestId,
          },
          "Slow query detected",
        );
      }

      return result;
    } catch (error) {
      const ms = Date.now() - start;

      breaker.recordFailure(error);
      metrics.query(ms, error);
      metrics.circuit(role, breaker.state);

      logger.error(
        {
          service: SERVICE_NAME,
          role,
          model: params.model,
          action: params.action,
          durationMs: ms,
          error: error.message,
          requestId,
        },
        "Query failed",
      );
      throw error;
    }
  });
};

// ── Database Manager ─────────────────────────────────────────────────────────
//
// Supports both eager and lazy connection modes:
//   Eager:  call db.connect() at startup (fail-fast, recommended for long-running servers)
//   Lazy:   skip db.connect() — Prisma auto-connects on first query (ideal for serverless)

function createDatabaseManager() {
  const metrics = createMetrics();

  const writeBreaker = createCircuitBreaker("write");
  const readBreaker = createCircuitBreaker("read");

  const writeClient = new PrismaClient({
    datasources: { db: { url: getDatabaseUrl("write") } },
  });

  const readClient = new PrismaClient({
    datasources: { db: { url: getDatabaseUrl("read") } },
  });

  attachMiddleware(writeClient, "write", writeBreaker, metrics);
  attachMiddleware(readClient, "read", readBreaker, metrics);

  let connectPromise = null;

  const connect = async () => {
    if (connectPromise) return connectPromise;

    connectPromise = Promise.all([
      connectWithRetry(writeClient, "write", metrics),
      connectWithRetry(readClient, "read", metrics),
    ]).catch((error) => {
      connectPromise = null;
      throw error;
    });

    return connectPromise;
  };

  const disconnect = async () => {
    connectPromise = null;
    const errors = [];

    for (const [client, role] of [
      [writeClient, "write"],
      [readClient, "read"],
    ]) {
      try {
        await client.$disconnect();
        logger.info(
          { service: SERVICE_NAME, role },
          `SQL database disconnected (${role})`,
        );
      } catch (error) {
        logger.error(
          { service: SERVICE_NAME, error: error.message, role },
          `Failed to disconnect (${role})`,
        );
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "Failed to disconnect database clients",
      );
    }
  };

  const HEALTH_CACHE_TTL_MS = 2_000;
  let healthCache = null;
  let healthCacheAt = 0;

  const healthCheck = async () => {
    const now = Date.now();
    if (healthCache && now - healthCacheAt < HEALTH_CACHE_TTL_MS) {
      return healthCache;
    }

    const check = async (client, role) => {
      try {
        await Promise.race([
          client.$queryRaw`SELECT 1`,
          sleep(HEALTH_CHECK_TIMEOUT_MS).then(() => {
            throw new Error("Health check timed out");
          }),
        ]);
        metrics.health(role, true);
        return true;
      } catch (error) {
        metrics.health(role, false);
        logger.warn(
          { service: SERVICE_NAME, error: error.message, role },
          `Health check failed (${role})`,
        );
        return false;
      }
    };

    const [write, read] = await Promise.all([
      check(writeClient, "write"),
      check(readClient, "read"),
    ]);

    healthCache = { write, read };
    healthCacheAt = now;
    return healthCache;
  };

  return Object.freeze({
    write: writeClient,
    read: readClient,
    connect,
    disconnect,
    healthCheck,
    getMetrics: () => metrics.snapshot(),
  });
}

const db = createDatabaseManager();

export default db;
