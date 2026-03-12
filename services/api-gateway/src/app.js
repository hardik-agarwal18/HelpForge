import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import { errorHandler } from "./utils/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from API Gateway!");
});

// Routes
app.use("/api/auth", authRoutes);

// Error handler middleware (must be last)
app.use(errorHandler);

export default app;
