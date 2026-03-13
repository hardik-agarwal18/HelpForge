import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import organizationRoutes from "./modules/organization/org.routes.js";
import agentRoutes from "./modules/tickets/agent.routes.js";
import ticketRoutes from "./modules/tickets/ticket.routes.js";
import { errorHandler } from "./utils/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from API Gateway!");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/tickets", ticketRoutes);

// Error handler middleware (must be last)
app.use(errorHandler);

export default app;
