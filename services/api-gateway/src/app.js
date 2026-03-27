import crypto from "node:crypto";
import express from "express";
import "./events/registerHandlers.js";
import db, { requestContext } from "./config/database.config.js";
import { redisHealthCheck, getRedisMetrics } from "./config/redis.config.js";
import authRoutes from "./modules/auth/auth.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import organizationRoutes from "./modules/organization/org.routes.js";
import agentRoutes from "./modules/tickets/ticket.agent.routes.js";
import ticketRoutes from "./modules/tickets/ticket.routes.js";
import aiAutomationRoutes from "./modules/ai/automation/ai.automation.routes.js";
import aiAugmentationRoutes from "./modules/ai/augmentation/ai.augmentation.routes.js";
import aiConfigRoutes from "./modules/ai/config/ai.config.routes.js";
import aiInternalRoutes from "./modules/ai/internal/ai.internal.routes.js";
import scraperRoutes from "./modules/ai/scraper/scraper.routes.js";
import { errorHandler } from "./utils/errorHandler.js";
import config from "./config/index.js";
import {
  metricsHandler,
  metricsMiddleware,
  recordAbort,
} from "./observability/prometheus.js";

const app = express();

const REQUEST_TIMEOUT_MS = config.server.requestTimeoutMs;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

app.use(express.json());

// Reject new requests during shutdown
app.use((_req, res, next) => {
  if (app.locals.isShuttingDown) {
    res.set("Connection", "close");
    return res.status(503).json({ error: "Server is shutting down" });
  }
  next();
});

// Request timeout — abort downstream work if handler doesn't respond in time
app.use((req, res, next) => {
  const ac = new AbortController();
  req.signal = ac.signal;

  const emitAbort = (reason) => {
    const route = req.route?.path
      ? `${req.baseUrl || ""}${req.route.path}`
      : req.path;
    recordAbort(reason, req.method, route);
  };

  const timer = setTimeout(() => {
    ac.abort(new Error("REQUEST_TIMEOUT"));
    emitAbort("timeout");
    if (!res.headersSent) {
      res.status(504).json({ error: "Request timed out" });
    }
  }, REQUEST_TIMEOUT_MS);

  res.on("close", () => {
    clearTimeout(timer);
    if (!ac.signal.aborted) {
      ac.abort(new Error("CLIENT_DISCONNECT"));
      emitAbort("client_disconnect");
    }
  });
  next();
});

// Attach requestId + signal, propagate through AsyncLocalStorage for DB tracing
app.use((req, res, next) => {
  const incoming =
    req.headers["x-request-id"] || req.headers["X-Request-ID"] || "";
  req.id = incoming || crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  requestContext.run({ requestId: req.id, signal: req.signal }, next);
});

app.use(metricsMiddleware);

app.get("/", (_req, res) => {
  res.send("Hello from API Gateway!");
});

// K8s liveness — process alive, no dependency checks
app.get("/health/live", (_req, res) => {
  if (app.locals.isShuttingDown) {
    return res.status(503).json({ status: "shutting_down" });
  }
  res.json({ status: "alive" });
});

// K8s readiness — DB + Redis must be reachable, with timeout protection
app.get("/health/ready", async (_req, res) => {
  if (app.locals.isShuttingDown) {
    return res.status(503).json({ status: "shutting_down" });
  }

  try {
    const [dbStatus, redisStatus] = await Promise.race([
      Promise.all([db.healthCheck(), redisHealthCheck()]),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Health check timed out")),
          HEALTH_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);

    const ok = dbStatus.write && dbStatus.read && redisStatus.connected;
    res.status(ok ? 200 : 503).json({
      status: ok ? "healthy" : "degraded",
      db: dbStatus,
      redis: redisStatus,
    });
  } catch {
    res.status(503).json({ status: "timeout" });
  }
});

// Backward compat — alias to readiness
app.get("/health", (req, res, next) => {
  req.url = "/health/ready";
  app.handle(req, res, next);
});

app.get("/metrics/db", (_req, res) => {
  res.json(db.getMetrics());
});

app.get("/metrics/redis", (_req, res) => {
  res.json(getRedisMetrics());
});

app.get("/metrics", metricsHandler);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ai/automation", aiAutomationRoutes);
app.use("/api/ai/augmentation", aiAugmentationRoutes);
app.use("/api/ai/config", aiConfigRoutes);
app.use("/api/ai/internal", aiInternalRoutes);
app.use("/api/ai/scraper", scraperRoutes);

// Error handler middleware (must be last)
app.use(errorHandler);

export default app;
