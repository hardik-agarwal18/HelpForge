import logger from "../../../config/logger.js";
import * as decisionEngine from "./ai.automation.decision.js";
import {
  getTicket,
  getTicketWithComments,
  updateTicket,
} from "./ai.automation.repo.js";
import { ApiError } from "../../../utils/errorHandler.js";
import aiConfig from "../core/config/ai.config.js";
import { inspectAIAutomationDLQ } from "./queue/ai.automation.queue.js";
import {
  ticketIdParamSchema,
  organizationIdParamSchema,
} from "./ai.automation.validator.js";
import { validateTicketExists } from "./ai.automation.utils.js";

/**
 * AI Controller - PHASE 2
 * Handles HTTP requests for AI decision engine
 * Coordinates between routes, service, and data layers
 */

/**
 * GET /ai/status/:ticketId
 * Get current AI status and suggestions for a ticket
 */
export const getStatus = async (req, res, next) => {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);

    const ticket = await getTicket(ticketId);
    validateTicketExists(ticket, ticketId);

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
    next(error);
  }
};

/**
 * POST /ai/decision/:ticketId
 * Get AI decision recommendation for a ticket
 * Useful for UI to show AI recommendations
 */
export const getDecision = async (req, res, next) => {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);

    const ticket = await getTicketWithComments(ticketId);
    validateTicketExists(ticket, ticketId);

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
    next(error);
  }
};

/**
 * POST /ai/toggle/:ticketId
 * Enable/disable AI for a specific ticket
 */
export const toggleAI = async (req, res, next) => {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);
    const { aiActive } = req.body;

    if (typeof aiActive !== "boolean") {
      throw new ApiError(400, "aiActive must be a boolean", "INVALID_AI_ACTIVE");
    }

    const updated = await updateTicket(ticketId, { aiActive });

    logger.info({ ticketId, aiActive }, "AI toggled for ticket");

    res.json({
      ticketId: updated.id,
      aiActive: updated.aiActive,
    });
  } catch (error) {
    logger.error({ error, ticketId: req.params.ticketId }, "Error toggling AI");
    next(error);
  }
};

/**
 * POST /ai/override/:ticketId
 * Override AI decision and manually assign or resolve
 */
export const overrideDecision = async (req, res, next) => {
  try {
    const { ticketId } = ticketIdParamSchema.parse(req.params);
    const { action, assignToId, status } = req.body;

    const ticket = await getTicket(ticketId);
    validateTicketExists(ticket, ticketId);

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

    const updated = await updateTicket(ticketId, updateData);

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
    next(error);
  }
};

/**
 * GET /ai/config
 * Get current AI decision rules/configuration
 */
export const getConfig = async (req, res, next) => {
  try {
    const rules = decisionEngine.getDecisionRules();

    res.json({
      automation: {
        retryLimit: aiConfig.automation.retryLimit,
        retryBackoffMs: aiConfig.automation.retryBackoffMs,
        dlqStorage: "postgres",
        dlqMaxEntries: aiConfig.automation.dlqMaxEntries,
      },
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
    next(error);
  }
};

/**
 * GET /ai/queue/dlq
 * Inspect persisted DLQ entries and BullMQ failed jobs
 */
export const getDLQInspection = async (req, res, next) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10);
    const inspection = await inspectAIAutomationDLQ(
      Number.isFinite(limit) ? limit : 50,
    );

    res.json(inspection);
  } catch (error) {
    logger.error({ error }, "Error inspecting AI automation DLQ");
    next(error);
  }
};
