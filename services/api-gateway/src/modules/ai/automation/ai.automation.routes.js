import express from "express";
import { validate } from "../../../middleware/validation.middleware.js";
import {
  getStatus,
  getDecision,
  toggleAI,
  overrideDecision,
  getConfig,
  getDLQInspection,
  getStats,
} from "./ai.automation.controller.js";
import {
  toggleAISchema,
  overrideDecisionSchema,
} from "./ai.automation.validator.js";

const router = express.Router();

/**
 * AI Decision Routes - PHASE 2
 * Handle AI suggestions, overrides, and configuration
 */

// Status endpoint
router.get("/status/:ticketId", getStatus);

// Decision endpoint
router.post("/decision/:ticketId", getDecision);

// Toggle AI endpoint
router.post("/toggle/:ticketId", validate(toggleAISchema), toggleAI);

// Override decision endpoint
router.post(
  "/override/:ticketId",
  validate(overrideDecisionSchema),
  overrideDecision,
);

// Configuration endpoint
router.get("/config", getConfig);

// DLQ inspection endpoint
router.get("/queue/dlq", getDLQInspection);

export default router;
