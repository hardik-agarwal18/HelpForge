import express from "express";
import {
  getStatus,
  getDecision,
  toggleAI,
  overrideDecision,
  getConfig,
  getStats,
} from "./ai.controller.js";

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
router.post("/toggle/:ticketId", toggleAI);

// Override decision endpoint
router.post("/override/:ticketId", overrideDecision);

// Configuration endpoint
router.get("/config", getConfig);

// Statistics endpoint
router.get("/stats/:organizationId", getStats);

export default router;
