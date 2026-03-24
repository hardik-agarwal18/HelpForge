import crypto from "node:crypto";
import express from "express";
import "./events/registerHandlers.js";
import db, { requestContext } from "./config/database.config.js";
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

const app = express();

app.use(express.json());

// Attach requestId + propagate through AsyncLocalStorage for DB tracing
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  requestContext.run({ requestId: req.id }, next);
});

app.get("/", (_req, res) => {
  res.send("Hello from API Gateway!");
});

// Health & metrics
app.get("/health/db", async (_req, res) => {
  const status = await db.healthCheck();
  const ok = status.write && status.read;
  res.status(ok ? 200 : 503).json(status);
});

app.get("/metrics/db", (_req, res) => {
  res.json(db.getMetrics());
});

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
