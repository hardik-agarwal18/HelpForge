import express from "express";
import "./events/registerHandlers.js";
import authRoutes from "./modules/auth/auth.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import organizationRoutes from "./modules/organization/org.routes.js";
import agentRoutes from "./modules/tickets/ticket.agent.routes.js";
import ticketRoutes from "./modules/tickets/ticket.routes.js";
import aiAutomationRoutes from "./modules/ai/automation/ai.automation.routes.js";
import aiAugmentationRoutes from "./modules/ai/augmentation/ai.augmentation.routes.js";
import aiConfigRoutes from "./modules/ai/config/ai.config.routes.js";
import aiInternalRoutes from "./modules/ai/internal/ai.internal.routes.js";
import { errorHandler } from "./utils/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Hello from API Gateway!");
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

// Error handler middleware (must be last)
app.use(errorHandler);

export default app;
