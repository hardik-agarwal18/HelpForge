import logger from "../../../config/logger.js";
import {
  generateAIResponse,
  generateAISummary,
} from "../core/provider/ai.provider.orchestrator.js";
import aiConfig from "../core/config/ai.config.js";
import * as decisionEngine from "./ai.automation.decision.js";
import { shouldProcessAI } from "./ai.automation.guards.js";
import * as aiUtils from "./ai.automation.utils.js";
import {
  AUTOMATION_PROMPTS,
  buildTicketContext,
} from "../core/prompts/automation.prompt.js";
import { logAIActivity } from "../core/repo/ai.logs.repo.js";
import {
  getTicketWithComments,
  updateTicket,
  getAvailableAgents,
} from "./ai.automation.repo.js";
import { getAIConfigByOrg } from "../config/ai.config.repo.js";

const { idempotencyTtlMs, processingLockTtlMs } = aiConfig.automation;

/**
 * AI Service - Main orchestrator for AI functionality
 * Coordinates between provider, decision engine, and data persistence
 */

/**
 * Handle ticket comment event - Main entry point
 * @param {Object} payload - Event payload with ticketId and commentId
 */
export const handleCommentAdded = async (payload) => {
  const { ticketId, commentId } = payload;
  let processingLockAcquired = false;
  let usingIdempotency = false;

  try {
    logger.info(
      { ticketId, commentId },
      "AI Service: Processing comment added event",
    );

    if (!commentId) {
      logger.warn(
        { ticketId, payload },
        "Skipping AI processing without commentId",
      );
      return;
    }

    if (await aiUtils.hasCommentBeenProcessed(commentId)) {
      logger.info(
        { ticketId, commentId },
        "Skipping duplicate AI automation event for processed comment",
      );
      return;
    }

    const lockResult = await aiUtils.acquireCommentProcessingLock(
      commentId,
      processingLockTtlMs,
    );
    usingIdempotency = lockResult !== null;
    processingLockAcquired = lockResult === true;

    if (!usingIdempotency) {
      logger.warn(
        { ticketId, commentId },
        "AI idempotency unavailable, continuing without duplicate protection",
      );
    }

    if (usingIdempotency && !processingLockAcquired) {
      logger.info(
        { ticketId, commentId },
        "Skipping duplicate AI automation event while comment is processing",
      );
      return;
    }

    // Fetch full ticket and comments
    const ticket = await getTicketWithComments(ticketId);

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found");
      return;
    }

    // Fetch org-level AI config (falls back to system defaults when null)
    const orgConfig = await getAIConfigByOrg(ticket.organizationId);

    // Short-circuit if AI is disabled at org level
    if (orgConfig && !orgConfig.aiEnabled) {
      logger.info(
        { ticketId, organizationId: ticket.organizationId },
        "AI processing skipped: disabled by org config",
      );
      return;
    }

    // Get the newly added comment
    const newComment = ticket.comments.find((c) => c.id === commentId);
    if (!newComment) {
      logger.warn({ commentId }, "Comment not found");
      return;
    }

    // Skip if comment is from AI or system
    if (newComment.authorType !== "USER") {
      logger.debug(
        { commentId, authorType: newComment.authorType },
        "Skipping non-user comment",
      );
      return;
    }

    // ✅ SINGLE GUARD LAYER - All checks in one place
    const guardResult = shouldProcessAI(ticket, orgConfig);
    if (!guardResult.canProcess) {
      logger.info(
        { ticketId, reason: guardResult.reason },
        "AI processing blocked by guard",
      );
      return;
    }

    // Decide if AI should respond (confidence-based, not guard-based)
    const decision = decisionEngine.shouldRespondToComment(
      ticket,
      ticket.comments,
    );

    if (!decision.shouldRespond) {
      logger.info(
        { ticketId, reason: decision.reason },
        "AI should not respond",
      );
      return;
    }

    // Generate AI response
    await generateAndStoreAIResponse(ticket, newComment, orgConfig);

    if (usingIdempotency) {
      await aiUtils.markCommentAsProcessed(commentId, idempotencyTtlMs);
    }
  } catch (error) {
    logger.error({ error, payload }, "Error in handleCommentAdded");
    throw error;
  } finally {
    if (usingIdempotency && processingLockAcquired && commentId) {
      await aiUtils.releaseCommentProcessingLock(commentId);
    }
  }
};

/**
 * Generate AI response and store it
 * PHASE 2: Handles auto-resolution, smart assignment, and routing
 * @param {Object} ticket - Ticket object with full context
 * @param {Object} latestComment - Latest user comment
 * @param {Object|null} orgConfig - Org-level AIConfig (null = use system defaults)
 */
export const generateAndStoreAIResponse = async (ticket, latestComment, orgConfig = null) => {
  try {
    logger.info({ ticketId: ticket.id }, "Generating AI response");

    // Build context for AI
    const context = buildTicketContext(
      ticket,
      ticket.comments,
      latestComment.message,
    );

    // Call AI provider to generate response
    const aiResult = await generateAIResponse({
      ticketId: ticket.id,
      context,
      systemPrompt: AUTOMATION_PROMPTS.TICKET_ASSISTANT_SYSTEM,
    });
    const aiResponse = aiResult.content;
    const aiUsage = aiResult.aiUsage;

    // Enhanced confidence calculation with more factors
    const confidenceData = decisionEngine.calculateConfidence({
      responseLength: aiResponse.length,
      hasProblematicKeywords: aiUtils.checkProblematicKeywords(aiResponse),
      isFollowUp: ticket.comments.length > 3,
      ticketPriority: ticket.priority,
      ticketAge: Date.now() - ticket.createdAt.getTime(),
      commentCount: ticket.comments.length,
      hasAttachments: ticket.comments.some(
        (c) => c.attachments && c.attachments.length > 0,
      ),
      descriptionLength: ticket.description?.length || 0,
    });

    // Build org-level threshold overrides for the decision engine
    const decisionOptions = {
      canAssign: !ticket.assignedToId, // Can only assign if not already assigned
    };
    if (orgConfig) {
      decisionOptions.enableAutoResolve = orgConfig.enableAutoResolve;
      decisionOptions.enableSmartAssign = orgConfig.enableSmartAssign;
      decisionOptions.autoResolveThreshold = orgConfig.autoResolveThreshold;
      decisionOptions.suggestThreshold = orgConfig.suggestThreshold;
      decisionOptions.smartAssignThreshold = orgConfig.smartAssignThreshold;
    }

    // PHASE 2: Get detailed action decision
    const action = decisionEngine.decideAction(confidenceData.confidence, decisionOptions);

    logger.info(
      {
        ticketId: ticket.id,
        confidence: confidenceData.confidence,
        action: action.type,
        reasoning: action.reasoning,
      },
      "AI decision made",
    );

    // Store AI response as comment
    const aiComment = await aiUtils.storeAIComment(
      ticket.id,
      aiResponse,
      confidenceData,
      action,
      aiUsage,
    );

    await logAIActivity({
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      module: "ai.automation",
      action: "response_generated",
      metadata: {
        commentId: latestComment.id,
        aiCommentId: aiComment.id,
        model: aiUsage?.model,
        aiUsage,
      },
    });

    // Update ticket state based on decision
    const ticketUpdate = decisionEngine.buildTicketUpdate(ticket, {
      ...confidenceData,
      action,
      currentAiResponseCount: ticket.comments.filter(
        (c) => c.authorType === "AI",
      ).length,
    });

    // PHASE 2: Handle different action types
    switch (action.type) {
      case "auto_resolve":
        await handleAutoResolve(ticket, aiComment, action);
        break;

      case "smart_assign":
        await handleSmartAssign(ticket, aiComment, action);
        break;

      case "suggest":
        await handleSuggestion(ticket, aiComment, action);
        break;

      case "store_and_wait":
        // Just store, no additional action
        logger.info(
          { ticketId: ticket.id },
          "Storing AI response, awaiting user feedback",
        );
        break;

      default:
        logger.warn({ action: action.type }, "Unknown action type");
    }

    // Apply ticket updates
    const updatedTicket = await updateTicket(ticket.id, ticketUpdate);

    logger.info(
      {
        ticketId: ticket.id,
        aiCommentId: aiComment.id,
        confidence: confidenceData.confidence,
        action: action.type,
        newStatus: updatedTicket.status,
        aiUsage,
      },
      "AI response processed and ticket updated",
    );

    // TODO: Emit event for UI updates and real-time notifications
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id },
      "Error generating/storing AI response",
    );
    throw error;
  }
};
/**
 * PHASE 2: Handle auto-resolution
 */
const handleAutoResolve = async (ticket, aiComment, action) => {
  try {
    logger.info(
      { ticketId: ticket.id, confidence: action.confidence },
      "AUTO-RESOLVING TICKET: High confidence AI solution",
    );

    // In production: Emit event for notifications
    // (TICKET_AUTO_RESOLVED_BY_AI event)
    // UI would show: "Your issue has been resolved by our AI assistant"
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id },
      "Error in auto-resolution handler",
    );
  }
};

/**
 * PHASE 2: Handle smart assignment
 */
const handleSmartAssign = async (ticket, aiComment, action) => {
  try {
    logger.info(
      {
        ticketId: ticket.id,
        confidence: action.confidence,
        reason: action.reasoning,
      },
      "SMART ASSIGNMENT: Confident but needs agent review",
    );

    // Fetch available agents for this organization
    const availableAgents = await getAvailableAgents(ticket.organizationId);

    if (availableAgents.length === 0) {
      logger.warn(
        { ticketId: ticket.id },
        "No available agents for smart assignment",
      );
      return;
    }

    // Select best agent (least busy)
    const selectedAgent = decisionEngine.selectBestAgent(
      availableAgents,
      ticket,
    );

    if (selectedAgent) {
      // Assign ticket to agent
      await updateTicket(ticket.id, {
        assignedToId: selectedAgent.userId,
        status: "IN_PROGRESS",
      });

      logger.info(
        {
          ticketId: ticket.id,
          agentId: selectedAgent.userId,
          confidence: action.confidence,
        },
        "Ticket smart-assigned to agent",
      );

      // TODO: Emit TICKET_ASSIGNED_EVENT for notifications
    }
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id },
      "Error in smart assignment handler",
    );
  }
};

/**
 * PHASE 2: Handle suggestion mode
 * Medium confidence - show to user, wait for feedback
 */
const handleSuggestion = async (ticket, aiComment, action) => {
  try {
    logger.info(
      {
        ticketId: ticket.id,
        confidence: action.confidence,
      },
      "SUGGESTION MODE: Medium confidence, awaiting user feedback",
    );

    // TODO: Mark comment as a suggestion (needs metadata)
    // UI shows: "AI suggests: [response] - Does this help?"
    // If user says no, assign to agent
  } catch (error) {
    logger.error({ error, ticketId: ticket.id }, "Error in suggestion handler");
  }
};

/**
 * Generate and store ticket summary
 * @param {string} ticketId - Ticket ID
 */
export const generateTicketSummary = async (ticketId) => {
  try {
    const ticket = await getTicketWithComments(ticketId);

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found for summary");
      return null;
    }

    const summaryResult = await generateAISummary(ticket.comments);
    const summary = summaryResult.content;

    await logAIActivity({
      organizationId: ticket.organizationId,
      ticketId,
      module: "ai.automation",
      action: "summary_generated",
      metadata: {
        model: summaryResult.aiUsage?.model,
        aiUsage: summaryResult.aiUsage,
      },
    });

    logger.info(
      { ticketId, summaryLength: summary.length },
      "Generated ticket summary",
    );

    return summary;
  } catch (error) {
    logger.error({ error, ticketId }, "Error generating ticket summary");
    throw error;
  }
};

/**
 * Toggle AI for a specific ticket
 * @param {string} ticketId - Ticket ID
 * @param {boolean} active - Enable/disable AI
 */
export const toggleAIForTicket = async (ticketId, active) => {
  try {
    await updateTicket(ticketId, { aiActive: active });

    logger.info({ ticketId, aiActive: active }, "AI toggled for ticket");
  } catch (error) {
    logger.error({ error, ticketId }, "Error toggling AI for ticket");
    throw error;
  }
};
