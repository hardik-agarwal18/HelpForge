import logger from "../../../config/logger.js";
import * as aiRepo from "./ai.automation.repo.js";

/**
 * AI Automation Utilities
 * Reusable helper functions for response formatting, analysis, and persistence
 */

// ============================================================================
// TEXT ANALYSIS UTILITIES
// ============================================================================

/**
 * Check if text contains problematic keywords indicating uncertainty
 * @param {string} text - Text to analyze
 * @returns {boolean} True if problematic keywords found
 */
export const checkProblematicKeywords = (text) => {
  const keywords = [
    "maybe", // Uncertainty
    "probably", // Uncertainty
    "not sure", // Uncertainty
    "unclear", // Unclear problem
    "sorry", // Apologetic (might need human touch)
    "i think", // Vague speculation
    "might be", // Uncertainty
    "could be", // Uncertainty
  ];

  const lowerText = text.toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword));
};

/**
 * Extract list of uncertainty indicators from text
 * @param {string} text - Text to analyze
 * @returns {Array} Array of found keywords
 */
export const extractUncertaintyIndicators = (text) => {
  const indicators = [
    "maybe",
    "probably",
    "not sure",
    "unclear",
    "sorry",
    "i think",
    "might be",
    "could be",
    "uncertain",
  ];

  const lowerText = text.toLowerCase();
  return indicators.filter((indicator) => lowerText.includes(indicator));
};

/**
 * Validate response content quality
 * @param {string} response - Response text
 * @returns {Object} Quality metrics
 */
export const validateResponseQuality = (response) => {
  if (!response || typeof response !== "string") {
    return {
      isValid: false,
      length: 0,
      issues: ["Response is empty or not a string"],
    };
  }

  const issues = [];
  const length = response.length;
  const wordCount = response.split(/\s+/).length;

  // Check length constraints
  if (length < 50) {
    issues.push("Response too short (< 50 chars)");
  }
  if (length > 3000) {
    issues.push("Response too long (> 3000 chars)");
  }

  // Check word count
  if (wordCount < 10) {
    issues.push("Response too few words (< 10)");
  }

  return {
    isValid: issues.length === 0,
    length,
    wordCount,
    issues,
    hasProblematicKeywords: checkProblematicKeywords(response),
  };
};

// ============================================================================
// RESPONSE FORMATTING UTILITIES
// ============================================================================

/**
 * Format AI response based on action type
 * @param {string} response - Raw AI response
 * @param {Object} action - Action decision object with type
 * @returns {string} Formatted response with appropriate marker
 */
export const formatAIResponse = (response, action = {}) => {
  switch (action.type) {
    case "auto_resolve":
      return `✅ **AI Resolution**: ${response}`;

    case "suggest":
      return `💡 **AI Suggestion**: ${response}`;

    case "smart_assign":
      return `👤 **AI Recommendation**: ${response}\n\nAssigning to available agent...`;

    case "store_and_wait":
    default:
      return response;
  }
};

/**
 * Create AI comment metadata
 * @param {Object} confidenceData - Confidence calculation result
 * @param {Object} action - Action decision
 * @returns {Object} Metadata object
 */
export const createAIMetadata = (confidenceData = {}, action = {}) => {
  return {
    confidence: confidenceData.confidence || 0,
    action: action.type || "unknown",
    reasoning: action.reasoning || "",
    recommendation: confidenceData.recommendation || "unknown",
    timestamp: new Date().toISOString(),
  };
};

// ============================================================================
// COMMENT & PERSISTENCE UTILITIES
// ============================================================================

/**
 * Store AI generated comment in database
 * @param {string} ticketId - Ticket ID
 * @param {string} response - AI response text
 * @param {Object} confidenceData - Confidence data
 * @param {Object} action - Action decision
 * @returns {Promise<Object>} Created comment object
 */
export const storeAIComment = async (
  ticketId,
  response,
  confidenceData = {},
  action = {},
) => {
  try {
    const formattedMessage = formatAIResponse(response, action);
    const metadata = createAIMetadata(confidenceData, action);

    const comment = await aiRepo.createComment({
      ticketId,
      message: formattedMessage,
      authorType: "AI",
      isInternal: false, // AI responses visible to user by default
      metadata, // Store confidence, action, reasoning for future reference
    });

    logger.debug(
      {
        ticketId,
        commentId: comment.id,
        action: action.type,
      },
      "AI comment stored successfully",
    );

    return comment;
  } catch (error) {
    logger.error({ error, ticketId }, "Failed to store AI comment");
    throw error;
  }
};

/**
 * Create internal AI note (not visible to user)
 * @param {string} ticketId - Ticket ID
 * @param {string} note - Internal note
 * @returns {Promise<Object>} Created comment object
 */
export const createInternalAINote = async (ticketId, note) => {
  try {
    return await aiRepo.createComment({
      ticketId,
      message: `*[Internal AI Note]: ${note}*`,
      authorType: "AI",
      isInternal: true, // Not visible to user
    });
  } catch (error) {
    logger.error({ error, ticketId }, "Failed to create internal AI note");
    throw error;
  }
};

// ============================================================================
// TICKET ANALYSIS UTILITIES
// ============================================================================

/**
 * Count AI responses on a ticket
 * @param {Array} comments - Comment array
 * @returns {number} Count of AI comments
 */
export const countAIResponses = (comments = []) => {
  return comments.filter((comment) => comment.authorType === "AI").length;
};

/**
 * Get last AI comment on ticket
 * @param {Array} comments - Comment array
 * @returns {Object|null} Last AI comment or null
 */
export const getLastAIComment = (comments = []) => {
  const aiComments = comments.filter((c) => c.authorType === "AI").reverse();
  return aiComments.length > 0 ? aiComments[0] : null;
};

/**
 * Get last user comment on ticket
 * @param {Array} comments - Comment array
 * @returns {Object|null} Last user comment or null
 */
export const getLastUserComment = (comments = []) => {
  const userComments = comments
    .filter((c) => c.authorType === "USER")
    .reverse();
  return userComments.length > 0 ? userComments[0] : null;
};

/**
 * Check if ticket is follow-up (multiple user comments)
 * @param {Array} comments - Comment array
 * @returns {boolean} True if follow-up
 */
export const isFollowUpTicket = (comments = []) => {
  const userComments = comments.filter((c) => c.authorType === "USER");
  return userComments.length > 1;
};

/**
 * Check if ticket has attachments in any comment
 * @param {Array} comments - Comment array
 * @returns {boolean} True if attachments exist
 */
export const hasTicketAttachments = (comments = []) => {
  return comments.some((c) => c.attachments && c.attachments.length > 0);
};

/**
 * Calculate ticket age in milliseconds
 * @param {Date|string} createdAt - Ticket creation date
 * @returns {number} Age in milliseconds
 */
export const calculateTicketAge = (createdAt) => {
  if (!createdAt) return 0;
  return Date.now() - new Date(createdAt).getTime();
};

/**
 * Determine if ticket is "recent" (less than 1 hour old)
 * @param {Date|string} createdAt - Ticket creation date
 * @returns {boolean} True if recent
 */
export const isRecentTicket = (createdAt) => {
  const ONE_HOUR_MS = 3600000;
  return calculateTicketAge(createdAt) < ONE_HOUR_MS;
};

/**
 * Determine if ticket is "aged" (more than 24 hours old)
 * @param {Date|string} createdAt - Ticket creation date
 * @returns {boolean} True if aged
 */
export const isAgedTicket = (createdAt) => {
  const ONE_DAY_MS = 86400000;
  return calculateTicketAge(createdAt) > ONE_DAY_MS;
};

/**
 * Build ticket analysis report
 * @param {Object} ticket - Ticket object
 * @returns {Object} Analysis report
 */
export const analyzeTicket = (ticket) => {
  const comments = ticket.comments || [];

  return {
    aiResponseCount: countAIResponses(comments),
    lastAIComment: getLastAIComment(comments),
    lastUserComment: getLastUserComment(comments),
    isFollowUp: isFollowUpTicket(comments),
    hasAttachments: hasTicketAttachments(comments),
    ticketAge: calculateTicketAge(ticket.createdAt),
    isRecent: isRecentTicket(ticket.createdAt),
    isAged: isAgedTicket(ticket.createdAt),
    totalComments: comments.length,
    userCommentCount: comments.filter((c) => c.authorType === "USER").length,
    aiCommentCount: countAIResponses(comments),
  };
};

// ============================================================================
// CONTEXT BUILDING UTILITIES
// ============================================================================

/**
 * Extract key information for confidence calculation
 * @param {Object} ticket - Ticket object
 * @param {Array} comments - Comment array
 * @param {string} response - AI response
 * @returns {Object} Confidence context
 */
export const buildConfidenceContext = (
  ticket,
  comments = [],
  response = "",
) => {
  const analysis = analyzeTicket(ticket);
  const qualityCheck = validateResponseQuality(response);

  return {
    responseLength: response.length,
    hasProblematicKeywords: checkProblematicKeywords(response),
    uncertaintyIndicators: extractUncertaintyIndicators(response),
    isFollowUp: analysis.isFollowUp,
    ticketPriority: ticket.priority,
    ticketAge: analysis.ticketAge,
    commentCount: analysis.totalComments,
    hasAttachments: analysis.hasAttachments,
    descriptionLength: ticket.description?.length || 0,
    responseQuality: qualityCheck,
  };
};

// ============================================================================
// ACTION HANDLER UTILITIES
// ============================================================================

/**
 * Log action decision
 * @param {Object} ticket - Ticket object
 * @param {Object} action - Action decision
 * @param {Object} confidenceData - Confidence data
 */
export const logActionDecision = (ticket, action = {}, confidenceData = {}) => {
  logger.info(
    {
      ticketId: ticket.id,
      actionType: action.type,
      confidence: confidenceData.confidence,
      reasoning: action.reasoning,
    },
    "AI action decision made",
  );
};

/**
 * Prepare ticket update payload based on action
 * @param {Object} ticket - Current ticket
 * @param {Object} action - Action decision
 * @param {Object} aiData - AI analysis data
 * @returns {Object} Update payload
 */
export const prepareTicketUpdate = (ticket, action = {}, aiData = {}) => {
  const update = {
    // Common updates
    aiMessageCount: (ticket.aiMessageCount || 0) + 1,
    lastAIInteraction: new Date(),
  };

  // Action-specific updates
  switch (action.type) {
    case "auto_resolve":
      update.status = "RESOLVED";
      update.resolvedBy = "AI";
      update.resolvedAt = new Date();
      break;

    case "smart_assign":
      // Will be handled by assignment logic
      update.status = "IN_PROGRESS";
      break;

    case "suggest":
      update.status = "AWAITING_FEEDBACK";
      break;

    case "store_and_wait":
    default:
      // No status change
      break;
  }

  return update;
};
