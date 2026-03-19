import logger from "../../../config/logger.js";
import * as augmentationService from "./ai.augmentation.service.js";
import { ApiError } from "../../../utils/errorHandler.js";
import {
  ticketIdParamSchema,
  agentIdParamSchema,
  organizationIdParamSchema,
  statsQuerySchema,
} from "./ai.augmentation.validator.js";

/**
 * AI Augmentation Controller - PHASE 3
 * Handles HTTP requests for agent augmentation
 * Coordinates between routes, service, and data layers
 */

/**
 * POST /augment/suggestion/:ticketId
 * Generate AI-powered suggested reply for agent
 */
export async function generateSuggestion(req, res, next) {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);

    logger.info({ ticketId }, "Generating agent suggestion");

    const suggestion =
      await augmentationService.generateAgentSuggestion(ticketId);

    if (!suggestion) {
      throw new ApiError(404, "Could not generate suggestion");
    }

    res.json({
      ticketId: suggestion.ticketId,
      suggestion: suggestion.suggestion,
      quality: suggestion.quality,
      confidence: suggestion.confidence,
      reasoning: suggestion.reasoning,
      copySuggestion: suggestion.copySuggestion,
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error generating suggestion",
    );
    next(error);
  }
}

/**
 * GET /augment/summary/:ticketId
 * Get ticket summary with key information for agent
 */
export async function getSummary(req, res, next) {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);

    logger.info({ ticketId }, "Generating ticket summary");

    const summary = await augmentationService.generateTicketSummary(ticketId);

    if (!summary) {
      throw new ApiError(404, "Ticket not found");
    }

    res.json({
      ticketId: summary.ticketId,
      title: summary.title,
      issue: summary.issue,
      timeline: summary.timeline,
      keyPoints: summary.keyPoints,
      attemptedSolutions: summary.attemptedSolutions,
      nextSteps: summary.nextSteps,
      customerSentiment: summary.customerSentiment,
      priority: summary.priority,
      age: summary.age,
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error generating summary",
    );
    next(error);
  }
}

/**
 * GET /augment/actions/:ticketId
 * Get suggested actions for agent
 */
export async function getSuggestedActions(req, res, next) {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);

    logger.info({ ticketId }, "Generating suggested actions");

    const actions =
      await augmentationService.generateSuggestedActions(ticketId);

    res.json({
      ticketId,
      suggestedActions: actions,
      actionCount: actions.length,
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error generating actions",
    );
    next(error);
  }
}

/**
 * GET /augment/agent-stats/:agentId
 * Get agent performance boosters and AI-powered metrics
 * Query params: ?days=7 (default)
 */
export async function getAgentStats(req, res, next) {
  try {
    const { agentId } = agentIdParamSchema.parse(req.params);
    const { days } = statsQuerySchema.parse(req.query);
    const effectiveDays = days || 7;

    logger.info(
      { agentId, days: effectiveDays },
      "Fetching agent augmentation stats",
    );

    const stats = await augmentationService.getAgentAugmentationStats(
      agentId,
      effectiveDays,
    );

    if (!stats) {
      throw new ApiError(404, "Agent not found or no data");
    }

    res.json(stats);
  } catch (error) {
    logger.error(
      { error, agentId: req.params.agentId },
      "Error fetching agent stats",
    );
    next(error);
  }
}

/**
 * POST /augment/quick-assist/:ticketId
 * One-endpoint solution: Get suggestion + summary + actions
 * For UI that wants everything at once
 */
export async function quickAssist(req, res, next) {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);

    logger.info({ ticketId }, "Generating quick assist");

    const [suggestion, summary, actions] = await Promise.all([
      augmentationService.generateAgentSuggestion(ticketId),
      augmentationService.generateTicketSummary(ticketId),
      augmentationService.generateSuggestedActions(ticketId),
    ]);

    res.json({
      ticketId,
      suggestion: suggestion || undefined,
      summary: summary || undefined,
      actions: actions || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error in quick assist",
    );
    next(error);
  }
}

/**
 * GET /augment/team-stats/:organizationId
 * Get team-wide AI augmentation impact
 * Query params: ?days=7 (default)
 */
export async function getTeamStats(req, res, next) {
  try {
    const { organizationId } = organizationIdParamSchema.parse(req.params);
    const { days } = statsQuerySchema.parse(req.query);
    const effectiveDays = days || 7;

    logger.info(
      { organizationId, days: effectiveDays },
      "Fetching team augmentation stats",
    );

    // Placeholder for team stats aggregation
    // In production: Query all agents in organization, aggregate their stats
    res.json({
      organizationId,
      period: `Last ${effectiveDays} days`,
      message: "Team stats aggregation - configure agent list first",
      // Will populate with:
      // - Total team tickets handled
      // - Average resolution rate
      // - AI-suggestion adoption rate
      // - Time saved by team
    });
  } catch (error) {
    logger.error(
      { error, organizationId: req.params.organizationId },
      "Error fetching team stats",
    );
    next(error);
  }
}
