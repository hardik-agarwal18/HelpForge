/**
 * Internal AI Routes
 * ───────────────────
 * Called exclusively by the Python chatbot service — never by end-user clients.
 *
 * Security: requests must carry `X-Internal-Token` matching INTERNAL_SERVICE_TOKEN.
 * These routes are NOT protected by user JWT auth — they are service-to-service.
 */

import express from "express";
import config from "../../../config/index.js";
import {
  generateController,
  generateStreamController,
  embeddingsController,
} from "./ai.internal.controller.js";

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────────────────────
const verifyInternalToken = (req, res, next) => {
  const token = req.headers["x-internal-token"];
  if (!token || token !== config.internal.serviceToken) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};

router.use(verifyInternalToken);

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Standard LLM generation (request / response)
router.post("/generate", generateController);

// SSE streaming generation
router.post("/generate/stream", generateStreamController);

// Batch embeddings
router.post("/embeddings", embeddingsController);

export default router;
