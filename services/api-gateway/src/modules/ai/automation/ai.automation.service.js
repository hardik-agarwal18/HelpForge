import logger from "../../../config/logger.js";
import * as aiProvider from "../core/provider/ai.provider.js";
import * as decisionEngine from "./ai.automation.decision.js";
import {
  AUTOMATION_PROMPTS,
  buildTicketContext,
} from "../core/prompts/automation.prompt.js";
import * as aiRepo from "./ai.automation.repo.js";

const AI_MAX_MESSAGES_PER_TICKET = 5;
const AI_COMMENT_COOLDOWN_MS = 30 * 1000;

const shouldSkipForMessageBudget = (ticket) => {
  const aiResponseCount =
    typeof ticket.aiMessageCount === "number"
      ? ticket.aiMessageCount
      : ticket.comments.filter((c) => c.authorType === "AI").length;

  if (aiResponseCount >= AI_MAX_MESSAGES_PER_TICKET) {
    logger.info(
      { ticketId: ticket.id, aiResponseCount },
      "AI budget guard: max messages reached",
    );
    return true;
  }

  return false;
};

const shouldSkipForCooldown = (ticket) => {
  const lastAiComment = [...ticket.comments]
    .reverse()
    .find((comment) => comment.authorType === "AI");

  if (!lastAiComment?.createdAt) {
    return false;
  }

  const cooldownRemainingMs =
    AI_COMMENT_COOLDOWN_MS -
    (Date.now() - new Date(lastAiComment.createdAt).getTime());

  if (cooldownRemainingMs > 0) {
    logger.info(
      {
        ticketId: ticket.id,
        cooldownRemainingMs,
        lastAiCommentId: lastAiComment.id,
      },
      "AI cooldown guard: skipping response",
    );
    return true;
  }

  return false;
};

/**
 * AI Service - Main orchestrator for AI functionality
 * Coordinates between provider, decision engine, and data persistence
 */

/**
 * Handle ticket comment event - Main entry point
 * @param {Object} payload - Event payload with ticketId and commentId
 */
export const handleCommentAdded = async (payload) => {
  try {
    const { ticketId, commentId } = payload;

    logger.info(
      { ticketId, commentId },
      "AI Service: Processing comment added event",
    );

    // Fetch full ticket and comments
    const ticket = await aiRepo.getTicketWithComments(ticketId);

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found");
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

    if (shouldSkipForMessageBudget(ticket)) {
      return;
    }

    if (shouldSkipForCooldown(ticket)) {
      return;
    }

    // Decide if AI should respond
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
    await generateAndStoreAIResponse(ticket, newComment);
  } catch (error) {
    logger.error({ error, payload }, "Error in handleCommentAdded");
  }
};

/**
 * Generate AI response and store it
 * PHASE 2: Handles auto-resolution, smart assignment, and routing
 * @param {Object} ticket - Ticket object with full context
 * @param {Object} latestComment - Latest user comment
 */
export const generateAndStoreAIResponse = async (ticket, latestComment) => {
  try {
    logger.info({ ticketId: ticket.id }, "Generating AI response");

    // Build context for AI
    const context = buildTicketContext(
      ticket,
      ticket.comments,
      latestComment.message,
    );

    // Call AI provider to generate response
    const aiResponse = await aiProvider.generateResponse({
      ticketId: ticket.id,
      context,
      systemPrompt: AUTOMATION_PROMPTS.TICKET_ASSISTANT_SYSTEM,
    });

    // Enhanced confidence calculation with more factors
    const confidenceData = decisionEngine.calculateConfidence({
      responseLength: aiResponse.length,
      hasProblematicKeywords: checkProblematicKeywords(aiResponse),
      isFollowUp: ticket.comments.length > 3,
      ticketPriority: ticket.priority,
      ticketAge: Date.now() - ticket.createdAt.getTime(),
      commentCount: ticket.comments.length,
      hasAttachments: ticket.comments.some(
        (c) => c.attachments && c.attachments.length > 0,
      ),
      descriptionLength: ticket.description?.length || 0,
    });

    // PHASE 2: Get detailed action decision
    const action = decisionEngine.decideAction(confidenceData.confidence, {
      canAssign: !ticket.assignedToId, // Can only assign if not already assigned
    });

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
    const aiComment = await storeAIComment(
      ticket.id,
      aiResponse,
      confidenceData,
      action,
    );

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
    const updatedTicket = await aiRepo.updateTicket(ticket.id, ticketUpdate);

    logger.info(
      {
        ticketId: ticket.id,
        aiCommentId: aiComment.id,
        confidence: confidenceData.confidence,
        action: action.type,
        newStatus: updatedTicket.status,
      },
      "AI response processed and ticket updated",
    );

    // TODO: Emit event for UI updates and real-time notifications
  } catch (error) {
    logger.error(
      { error, ticketId: ticket.id },
      "Error generating/storing AI response",
    );
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
    const availableAgents = await aiRepo.getAvailableAgents(
      ticket.organizationId,
    );

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
      await aiRepo.updateTicket(ticket.id, {
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
 * Store AI generated comment in database
 * PHASE 2: Store with action and confidence metadata
 */
const storeAIComment = async (
  ticketId,
  response,
  confidenceData,
  action = {},
) => {
  const message =
    action.type === "auto_resolve"
      ? `✅ **AI Resolution**: ${response}`
      : action.type === "suggest"
        ? `💡 **AI Suggestion**: ${response}`
        : response;

  return await aiRepo.createComment({
    ticketId,
    message,
    authorType: "AI",
    isInternal: false, // AI responses visible to user by default
    // Note: Add metadata field to store:
    // { confidence, action, reasoning } in production
  });
};

/**
 * Check if response contains problematic keywords that need review
 */
const checkProblematicKeywords = (text) => {
  const keywords = [
    "maybe", // Uncertainty
    "probably", // Uncertainty
    "not sure", // Uncertainty
    "unclear", // Unclear problem
    "sorry", // Apologetic (might need human touch)
  ];

  const lowerText = text.toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword));
};

/**
 * Generate and store ticket summary
 * @param {string} ticketId - Ticket ID
 */
export const generateTicketSummary = async (ticketId) => {
  try {
    const ticket = await aiRepo.getTicketWithComments(ticketId);

    if (!ticket) {
      logger.warn({ ticketId }, "Ticket not found for summary");
      return null;
    }

    const summary = await aiProvider.generateSummary(ticket.comments);

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
    await aiRepo.updateTicket(ticketId, { aiActive: active });

    logger.info({ ticketId, aiActive: active }, "AI toggled for ticket");
  } catch (error) {
    logger.error({ error, ticketId }, "Error toggling AI for ticket");
    throw error;
  }
};
