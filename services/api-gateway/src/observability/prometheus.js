import client from "prom-client";
import db from "../config/database.config.js";
import { getRedisMetrics } from "../config/redis.config.js";

const register = new client.Registry();
register.setDefaultLabels({
  service: "api-gateway",
});

client.collectDefaultMetrics({
  register,
  prefix: "helpforge_api_gateway_",
});

// ── HTTP Metrics ────────────────────────────────────────────────────────────

const httpRequestsTotal = new client.Counter({
  name: "helpforge_api_gateway_http_requests_total",
  help: "Total number of HTTP requests handled by the API gateway",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "helpforge_api_gateway_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const inFlightRequests = new client.Gauge({
  name: "helpforge_api_gateway_http_requests_in_flight",
  help: "Current in-flight HTTP requests",
  registers: [register],
});

// ── Database Metrics (from db.getMetrics() snapshot) ────────────────────────

const dbQueryTotal = new client.Gauge({
  name: "helpforge_api_gateway_db_queries_total",
  help: "Total database queries executed",
  registers: [register],
});

const dbQueryErrors = new client.Gauge({
  name: "helpforge_api_gateway_db_query_errors_total",
  help: "Total database query errors",
  registers: [register],
});

const dbQueryLatency = new client.Gauge({
  name: "helpforge_api_gateway_db_query_latency_ms",
  help: "Database query latency in milliseconds",
  labelNames: ["quantile"],
  registers: [register],
});

const dbConnectSuccess = new client.Gauge({
  name: "helpforge_api_gateway_db_connect_success_total",
  help: "Successful database connection attempts",
  registers: [register],
});

const dbConnectFailure = new client.Gauge({
  name: "helpforge_api_gateway_db_connect_failure_total",
  help: "Failed database connection attempts",
  registers: [register],
});

const dbHealthy = new client.Gauge({
  name: "helpforge_api_gateway_db_healthy",
  help: "Database health status (1 = healthy, 0 = unhealthy)",
  labelNames: ["role"],
  registers: [register],
});

const dbCircuitOpen = new client.Gauge({
  name: "helpforge_api_gateway_db_circuit_breaker_open",
  help: "Database circuit breaker state (1 = open/tripped, 0 = closed)",
  labelNames: ["role"],
  registers: [register],
});

// ── Redis Metrics (from getRedisMetrics() snapshot) ─────────────────────────

const redisCommandsTotal = new client.Gauge({
  name: "helpforge_api_gateway_redis_commands_total",
  help: "Total Redis commands executed",
  registers: [register],
});

const redisErrorsTotal = new client.Gauge({
  name: "helpforge_api_gateway_redis_errors_total",
  help: "Total Redis command errors",
  registers: [register],
});

const redisLatency = new client.Gauge({
  name: "helpforge_api_gateway_redis_latency_ms",
  help: "Redis command latency in milliseconds",
  labelNames: ["quantile"],
  registers: [register],
});

const redisActiveConnections = new client.Gauge({
  name: "helpforge_api_gateway_redis_active_connections",
  help: "Current active Redis connections",
  registers: [register],
});

const redisCircuitOpen = new client.Gauge({
  name: "helpforge_api_gateway_redis_circuit_breaker_open",
  help: "Redis circuit breaker state (1 = open/tripped, 0 = closed)",
  registers: [register],
});

// ── Collect DB + Redis snapshots before each /metrics scrape ────────────────

const collectInfraMetrics = () => {
  try {
    const dbSnap = db.getMetrics();
    dbQueryTotal.set(dbSnap.db_query_count);
    dbQueryErrors.set(dbSnap.db_query_errors);
    dbQueryLatency.set({ quantile: "0.5" }, dbSnap.db_query_p50_ms);
    dbQueryLatency.set({ quantile: "0.95" }, dbSnap.db_query_p95_ms);
    dbQueryLatency.set({ quantile: "0.99" }, dbSnap.db_query_p99_ms);
    dbConnectSuccess.set(dbSnap.db_connect_success);
    dbConnectFailure.set(dbSnap.db_connect_failure);

    for (const role of ["write", "read"]) {
      dbHealthy.set({ role }, dbSnap.db_health_status[role] === true ? 1 : 0);
      dbCircuitOpen.set(
        { role },
        dbSnap.db_circuit_breaker[role] === "OPEN" ? 1 : 0,
      );
    }
  } catch {
    // DB not connected yet — skip
  }

  try {
    const redisSnap = getRedisMetrics();
    redisCommandsTotal.set(redisSnap.redis_commands);
    redisErrorsTotal.set(redisSnap.redis_errors);
    redisLatency.set({ quantile: "0.5" }, redisSnap.redis_latency_p50_ms);
    redisLatency.set({ quantile: "0.95" }, redisSnap.redis_latency_p95_ms);
    redisLatency.set({ quantile: "0.99" }, redisSnap.redis_latency_p99_ms);
    redisActiveConnections.set(redisSnap.redis_active_connections);
    redisCircuitOpen.set(
      redisSnap.redis_circuit_breaker?.state === "OPEN" ? 1 : 0,
    );
  } catch {
    // Redis not connected yet — skip
  }
};

// ── Abort Metrics ───────────────────────────────────────────────────────────

const httpRequestAbortedTotal = new client.Counter({
  name: "helpforge_api_gateway_http_request_aborted_total",
  help: "Total HTTP requests aborted by timeout or client disconnect",
  labelNames: ["reason", "method", "route"],
  registers: [register],
});

export const recordAbort = (reason, method, route) => {
  httpRequestAbortedTotal.inc({ reason, method, route });
};

// ── HTTP Middleware ──────────────────────────────────────────────────────────

const toRouteString = (routePath) => {
  if (typeof routePath === "string") return routePath;
  if (routePath instanceof RegExp) return routePath.toString();
  return "unknown";
};

const getRouteLabel = (req) => {
  if (req.route?.path) {
    const routePath = toRouteString(req.route.path);
    return `${req.baseUrl || ""}${routePath}` || "/";
  }
  return "unmatched";
};

export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  let recorded = false;

  inFlightRequests.inc();

  const record = () => {
    if (recorded) return;
    recorded = true;

    inFlightRequests.dec();

    if (req.path === "/metrics" || req.path === "/health/live") return;

    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: getRouteLabel(req),
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, duration);
  };

  res.on("finish", record);
  res.on("close", record);
  next();
};

export const metricsHandler = async (_req, res) => {
  collectInfraMetrics();
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
};

export { register as prometheusRegistry };
