import express from "express";
import {
  generateSuggestion,
  getSummary,
  getSuggestedActions,
  getAgentStats,
  quickAssist,
  getTeamStats,
} from "./ai.augmentation.controller.js";

const router = express.Router();

/**
 * AI Augmentation Routes - PHASE 3
 * Agent-focused endpoints for AI suggestions, summaries, and performance
 */

// Suggestion endpoint
router.post("/suggestion/:ticketId", generateSuggestion);

// Summary endpoint
router.get("/summary/:ticketId", getSummary);

// Suggested actions endpoint
router.get("/actions/:ticketId", getSuggestedActions);

// Agent stats endpoint
router.get("/agent-stats/:agentId", getAgentStats);

// Quick assist endpoint
router.post("/quick-assist/:ticketId", quickAssist);

// Team stats endpoint
router.get("/team-stats/:organizationId", getTeamStats);

export default router;
