import logger from "../../config/logger.js";
import * as decisionEngine from "./ai.decision.js";
import * as aiRepo from "./ai.repo.js";

/**
 * AI Controller - PHASE 2
 * Handles HTTP requests for AI decision engine
 * Coordinates between routes, service, and data layers
 */

/**
 * GET /ai/status/:ticketId
 * Get current AI status and suggestions for a ticket
 */
export const getStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await aiRepo.getTicket(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({
      ticketId: ticket.id,
      aiActive: ticket.aiActive,
      aiMessageCount: ticket.aiMessageCount,
      lastAIComment: null, // TODO: Get from aiRepo.getAIComments
      status: ticket.status,
      priority: ticket.priority,
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error getting AI status",
    );
    res.status(500).json({ error: "Failed to get AI status" });
  }
};

/**
 * POST /ai/decision/:ticketId
 * Get AI decision recommendation for a ticket
 * Useful for UI to show AI recommendations
 */
export const getDecision = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await aiRepo.getTicketWithComments(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Calculate what AI would decide now
    const confidence = decisionEngine.calculateConfidence({
      responseLength: 250,
      hasProblematicKeywords: false,
      isFollowUp: ticket.comments.length > 3,
      ticketPriority: ticket.priority,
      ticketAge: Date.now() - ticket.createdAt.getTime(),
      commentCount: ticket.comments.length,
      hasAttachments: false,
      descriptionLength: ticket.description?.length || 0,
    });

    const action = decisionEngine.decideAction(confidence.confidence, {
      canAssign: !ticket.assignedToId,
    });

    res.json({
      ticketId: ticket.id,
      decision: {
        action: action.type,
        confidence: confidence.confidence,
        recommendation: confidence.recommendation,
        reasoning: confidence.reasoning,
      },
      rules: decisionEngine.getDecisionRules(),
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error getting decision",
    );
    res.status(500).json({ error: "Failed to get decision" });
  }
};

/**
 * POST /ai/toggle/:ticketId
 * Enable/disable AI for a specific ticket
 */
export const toggleAI = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { aiActive } = req.body;

    if (typeof aiActive !== "boolean") {
      return res.status(400).json({ error: "aiActive must be a boolean" });
    }

    const updated = await aiRepo.updateTicket(ticketId, { aiActive });

    logger.info({ ticketId, aiActive }, "AI toggled for ticket");

    res.json({
      ticketId: updated.id,
      aiActive: updated.aiActive,
    });
  } catch (error) {
    logger.error({ error, ticketId: req.params.ticketId }, "Error toggling AI");
    res.status(500).json({ error: "Failed to toggle AI" });
  }
};

/**
 * POST /ai/override/:ticketId
 * Override AI decision and manually assign or resolve
 */
export const overrideDecision = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action, assignToId, status } = req.body;

    const ticket = await aiRepo.getTicket(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const updateData = {};

    if (action === "resolve") {
      updateData.status = "RESOLVED";
      updateData.aiActive = false;
    } else if (action === "assign" && assignToId) {
      updateData.assignedToId = assignToId;
      updateData.status = "IN_PROGRESS";
    } else if (status) {
      updateData.status = status;
    }

    updateData.aiActive = false; // Disable AI when manually overridden

    const updated = await aiRepo.updateTicket(ticketId, updateData);

    logger.info(
      {
        ticketId,
        action,
        status: updated.status,
        assignedToId: updated.assignedToId,
      },
      "AI decision overridden",
    );

    res.json({
      ticketId: updated.id,
      status: updated.status,
      assignedToId: updated.assignedToId,
      aiActive: updated.aiActive,
    });
  } catch (error) {
    logger.error(
      { error, ticketId: req.params.ticketId },
      "Error overriding decision",
    );
    res.status(500).json({ error: "Failed to override decision" });
  }
};

/**
 * GET /ai/config
 * Get current AI decision rules/configuration
 */
export const getConfig = async (req, res) => {
  try {
    const rules = decisionEngine.getDecisionRules();

    res.json({
      rules,
      description: {
        MAX_AI_RESPONSES: "Maximum AI responses before fallback to agent",
        CONFIDENCE_THRESHOLD_AUTO_CLOSE: "Confidence to auto-resolve",
        CONFIDENCE_THRESHOLD_SUGGEST: "Confidence to suggest to user",
        SMART_ASSIGN_THRESHOLD: "Confidence to auto-assign to agent",
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting config");
    res.status(500).json({ error: "Failed to get config" });
  }
};

/**
 * GET /ai/stats/:organizationId
 * Get AI effectiveness statistics for organization
 */
export const getStats = async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Get all tickets created in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const tickets = await aiRepo.getOrganizationTickets(
      organizationId,
      sevenDaysAgo,
    );

    const aiResolvedCount = tickets.filter(
      (t) => t.status === "RESOLVED" && t.aiMessageCount > 0,
    ).length;

    const totalResolvedCount = tickets.filter(
      (t) => t.status === "RESOLVED",
    ).length;

    const avgMessagesWithAI =
      tickets
        .filter((t) => t.aiMessageCount > 0)
        .reduce((sum, t) => sum + t.aiMessageCount, 0) /
      Math.max(1, tickets.filter((t) => t.aiMessageCount > 0).length);

    res.json({
      organizationId,
      period: "Last 7 days",
      totalTickets: tickets.length,
      resolvedByAI: aiResolvedCount,
      totalResolved: totalResolvedCount,
      aiResolutionRate:
        totalResolvedCount > 0
          ? ((aiResolvedCount / totalResolvedCount) * 100).toFixed(2)
          : "0",
      avgAIMessagesPerTicket: avgMessagesWithAI.toFixed(2),
      effectiveness: {
        message: "AI is assisting with ticket resolution",
        metrics: {
          aiHelpfulCount: aiResolvedCount,
          aiSuggestionRate: ((avgMessagesWithAI / 5) * 100).toFixed(2) + "%",
        },
      },
    });
  } catch (error) {
    logger.error(
      { error, organizationId: req.params.organizationId },
      "Error getting stats",
    );
    res.status(500).json({ error: "Failed to get stats" });
  }
};
