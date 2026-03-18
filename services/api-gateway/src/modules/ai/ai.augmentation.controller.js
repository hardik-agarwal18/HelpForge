import logger from "../../config/logger.js";
import * as augmentationService from "./ai.augmentation.js";

/**
 * AI Augmentation Controller - PHASE 3
 * Handles HTTP requests for agent augmentation
 * Coordinates between routes, service, and data layers
 */

/**
 * POST /augment/suggestion/:ticketId
 * Generate AI-powered suggested reply for agent
 */
export async function generateSuggestion(req, res) {
  try {
    const { ticketId } = req.params;

    logger.info({ ticketId }, "Generating agent suggestion");

    const suggestion =
      await augmentationService.generateAgentSuggestion(ticketId);

    if (!suggestion) {
      return res.status(404).json({ error: "Could not generate suggestion" });
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
    res.status(500).json({ error: "Failed to generate suggestion" });
  }
}

/**
 * GET /augment/summary/:ticketId
 * Get ticket summary with key information for agent
 */
export async function getSummary(req, res) {
  try {
    const { ticketId } = req.params;

    logger.info({ ticketId }, "Generating ticket summary");

    const summary = await augmentationService.generateTicketSummary(ticketId);

    if (!summary) {
      return res.status(404).json({ error: "Ticket not found" });
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
    res.status(500).json({ error: "Failed to generate summary" });
  }
}

/**
 * GET /augment/actions/:ticketId
 * Get suggested actions for agent
 */
export async function getSuggestedActions(req, res) {
  try {
    const { ticketId } = req.params;

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
    res.status(500).json({ error: "Failed to generate suggested actions" });
  }
}

/**
 * GET /augment/agent-stats/:agentId
 * Get agent performance boosters and AI-powered metrics
 * Query params: ?days=7 (default)
 */
export async function getAgentStats(req, res) {
  try {
    const { agentId } = req.params;
    const days = parseInt(req.query.days) || 7;

    logger.info({ agentId, days }, "Fetching agent augmentation stats");

    const stats = await augmentationService.getAgentAugmentationStats(
      agentId,
      days,
    );

    if (!stats) {
      return res.status(404).json({ error: "Agent not found or no data" });
    }

    res.json(stats);
  } catch (error) {
    logger.error(
      { error, agentId: req.params.agentId },
      "Error fetching agent stats",
    );
    res.status(500).json({ error: "Failed to fetch agent stats" });
  }
}

/**
 * POST /augment/quick-assist/:ticketId
 * One-endpoint solution: Get suggestion + summary + actions
 * For UI that wants everything at once
 */
export async function quickAssist(req, res) {
  try {
    const { ticketId } = req.params;

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
    res.status(500).json({ error: "Failed to generate quick assist" });
  }
}

/**
 * GET /augment/team-stats/:organizationId
 * Get team-wide AI augmentation impact
 * Query params: ?days=7 (default)
 */
export async function getTeamStats(req, res) {
  try {
    const { organizationId } = req.params;
    const days = parseInt(req.query.days) || 7;

    logger.info({ organizationId, days }, "Fetching team augmentation stats");

    // Placeholder for team stats aggregation
    // In production: Query all agents in organization, aggregate their stats
    res.json({
      organizationId,
      period: `Last ${days} days`,
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
    res.status(500).json({ error: "Failed to fetch team stats" });
  }
}
