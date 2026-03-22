import logger from "../../../config/logger.js";
import { DECISION_RULES } from "./ai.automation.constants.js";

/**
 * Check if AI should respond to a comment
 * ⚠️ NOTE: All guard checks happen in ai.automation.guards.js
 * This function focuses on decision logic, not guard conditions
 *
 * @param {Object} ticket - Ticket object
 * @param {Array} comments - All ticket comments
 * @returns {Object} Decision with shouldRespond flag
 */
export const shouldRespondToComment = (ticket, comments) => {
  // All guard conditions (aiActive, max responses, cooldown, assignment state)
  // are already checked in shouldProcessAI() guard layer
  // This function can focus on additional decision logic if needed

  return {
    shouldRespond: true,
    reason: "PASSED_GUARDS",
    currentAiResponseCount: comments.filter((c) => c.authorType === "AI")
      .length,
  };
};

/**
 * Calculate confidence score for a response
 * PHASE 2: Enhanced with more factors and contextual scoring
 * @param {Object} context - Response context
 * @returns {Object} Confidence score and recommendation
 */
export const calculateConfidence = (context) => {
  const {
    responseLength,
    hasProblematicKeywords,
    isFollowUp,
    ticketPriority,
    ticketAge,
    commentCount,
    hasAttachments,
    descriptionLength,
  } = context;

  let score = 0.5; // Base score

  // Factor 1: Response length (good length = better answer)
  if (responseLength > 100 && responseLength < 500) {
    score += 0.15; // Good length
  } else if (responseLength > 500) {
    score += 0.05; // Too long, less confident
  }

  // Factor 2: Problem keywords (uncertainty indicators)
  if (hasProblematicKeywords) {
    score -= 0.2;
  }

  // Factor 3: Follow-ups (harder to resolve)
  if (isFollowUp) {
    score -= 0.1;
  } else {
    score += 0.05; // First response more likely to resolve
  }

  // Factor 4: Ticket priority (adjust risk)
  if (ticketPriority === "LOW") {
    score += 0.1; // Lower risk for low priority
  } else if (ticketPriority === "URGENT") {
    score -= 0.2; // Higher caution for urgent tickets
  } else if (ticketPriority === "HIGH") {
    score -= 0.1; // Moderate caution
  }

  // Factor 5: Ticket age (newer tickets easier to resolve)
  if (ticketAge && ticketAge < 3600000) {
    // Less than 1 hour old
    score += 0.1;
  } else if (ticketAge && ticketAge > 86400000) {
    // More than 24 hours old
    score -= 0.1;
  }

  // Factor 6: Comment history (more context = better)
  if (commentCount && commentCount > 5) {
    score += 0.05; // Rich context
  } else if (commentCount && commentCount === 1) {
    score += 0.08; // Single issue, usually clearer
  }

  // Factor 7: Attachments (usually technical issues)
  if (hasAttachments) {
    score -= 0.05; // Attachments often mean complex issues
  } else {
    score += 0.03; // Simpler issues likely
  }

  // Factor 8: Description quality
  if (descriptionLength && descriptionLength > 200) {
    score += 0.08; // Well-described issues
  }

  // Clamp between 0 and 1
  score = Math.max(0, Math.min(1, score));

  return {
    confidence: score,
    recommendation: getRecommendation(score),
    reasoning: getReasoningDescription(score, context),
  };
};

/**
 * Determine action based on confidence
 * PHASE 2: Routes based on confidence tiers
 * @param {number} confidence - Confidence score 0-1
 * @param {Object} options - Additional decision context
 * @returns {Object} Action decision with details
 */
export const decideAction = (confidence, options = {}) => {
  // Use org-level thresholds when provided, fall back to system constants
  const autoResolveThreshold =
    options.autoResolveThreshold ?? DECISION_RULES.CONFIDENCE_THRESHOLD_AUTO_CLOSE;
  const smartAssignThreshold =
    options.smartAssignThreshold ?? DECISION_RULES.SMART_ASSIGN_THRESHOLD;
  const suggestThreshold =
    options.suggestThreshold ?? DECISION_RULES.CONFIDENCE_THRESHOLD_SUGGEST;

  const enableAutoResolve = options.enableAutoResolve ?? true;
  const enableSmartAssign = options.enableSmartAssign ?? true;

  const action = {
    type: null,
    confidence,
    shouldAutoResolve: false,
    shouldSuggest: false,
    shouldAssign: false,
    reasoning: "",
  };

  if (enableAutoResolve && confidence >= autoResolveThreshold) {
    action.type = "auto_resolve";
    action.shouldAutoResolve = true;
    action.reasoning = "High confidence - can auto-resolve ticket";
  } else if (
    enableSmartAssign &&
    confidence >= smartAssignThreshold &&
    options.canAssign
  ) {
    action.type = "smart_assign";
    action.shouldAssign = true;
    action.reasoning =
      "Moderate confidence - suggest assignment to available agent";
  } else if (confidence >= suggestThreshold) {
    action.type = "suggest";
    action.shouldSuggest = true;
    action.reasoning = "Medium confidence - suggest to user, wait for feedback";
  } else {
    action.type = "store_and_wait";
    action.reasoning =
      "Low confidence - store response, wait for user feedback";
  }

  return action;
};

/**
 * Determine if ticket should be auto-assigned to an agent
 * PHASE 2: Smart assignment based on confidence and priority
 * @param {Object} ticket - Ticket object
 * @param {number} aiConfidence - AI confidence score
 * @returns {Object} Assignment decision
 */
export const shouldAutoAssignToAgent = (ticket, aiConfidence) => {
  // Already assigned
  if (ticket.assignedToId) {
    return { shouldAssign: false, reason: "ALREADY_ASSIGNED" };
  }

  // Priority-based rules
  if (ticket.priority === "URGENT" && DECISION_RULES.URGENT_AUTO_ASSIGN) {
    return {
      shouldAssign: true,
      reason: "URGENT_TICKET",
      priority: "URGENT",
    };
  }

  if (
    ticket.priority === "HIGH" &&
    DECISION_RULES.HIGH_AUTO_ASSIGN &&
    aiConfidence < 0.6
  ) {
    return {
      shouldAssign: true,
      reason: "HIGH_PRIORITY_LOW_AI_CONFIDENCE",
      priority: "HIGH",
    };
  }

  // AI confidence-based assignment
  if (
    aiConfidence >= DECISION_RULES.SMART_ASSIGN_THRESHOLD &&
    aiConfidence < DECISION_RULES.CONFIDENCE_THRESHOLD_AUTO_CLOSE
  ) {
    return {
      shouldAssign: true,
      reason: "MEDIUM_CONFIDENCE_NEEDS_REVIEW",
      priority: "NORMAL",
    };
  }

  return { shouldAssign: false, reason: "NO_ASSIGNMENT_NEEDED" };
};

/**
 * Find best agent for assignment
 * PHASE 2: Smart assignment logic
 * @param {Array} availableAgents - List of available agents
 * @param {Object} ticket - Ticket object
 * @returns {Object} Best agent or null
 */
export const selectBestAgent = (availableAgents, ticket) => {
  if (!availableAgents || availableAgents.length === 0) {
    logger.warn("No available agents for assignment");
    return null;
  }

  // Sort by workload (ascending) - assign to least busy
  const sortedAgents = availableAgents.sort((a, b) => {
    const aLoad = a.assignedToday || 0;
    const bLoad = b.assignedToday || 0;
    return aLoad - bLoad;
  });

  const selectedAgent = sortedAgents[0];
  logger.info(
    { agentId: selectedAgent.userId, workload: selectedAgent.assignedToday },
    "Selected agent for assignment",
  );

  return selectedAgent;
};

/**
 * Update ticket state after AI response
 * PHASE 2: Enhanced with action-based updates
 * @param {Object} ticket - Ticket to update
 * @param {Object} decision - Decision object with action
 * @returns {Object} Update payload
 */
export const buildTicketUpdate = (ticket, decision) => {
  const update = {
    aiMessageCount: ticket.aiMessageCount + 1,
  };

  // Handle different action types
  switch (decision.action?.type || decision.action) {
    case "auto_resolve":
      update.status = "RESOLVED";
      update.aiActive = false;
      logger.info({ ticketId: ticket.id }, "Decision: Auto-resolving ticket");
      break;

    case "smart_assign":
      // Don't update status here - assignment happens separately
      break;

    case "store_and_assign":
    case "store_and_wait":
      // Just incrementing message count
      break;

    default:
      break;
  }

  // If max responses reached, disable AI for fallback to agent
  if (decision.currentAiResponseCount + 1 >= DECISION_RULES.MAX_AI_RESPONSES) {
    logger.info(
      { ticketId: ticket.id },
      "Disabling AI: max responses reached - fallback to agent",
    );
    update.aiActive = false;
  }

  return update;
};

/**
 * Get DECISION_RULES for configuration
 */
export const getDecisionRules = () => {
  return DECISION_RULES;
};

/**
 * Get recommendation string
 * @private
 */
const getRecommendation = (score) => {
  if (score >= DECISION_RULES.CONFIDENCE_THRESHOLD_AUTO_CLOSE) {
    return "HIGH_CONFIDENCE_RESOLVE";
  }
  if (score >= DECISION_RULES.SMART_ASSIGN_THRESHOLD) {
    return "MODERATE_CONFIDENCE_ASSIGN";
  }
  if (score >= DECISION_RULES.CONFIDENCE_THRESHOLD_SUGGEST) {
    return "MEDIUM_CONFIDENCE_SUGGEST";
  }
  return "LOW_CONFIDENCE_STORE";
};

/**
 * Get reasoning description
 * @private
 */
const getReasoningDescription = (score, context) => {
  const factors = [];

  if (context.responseLength > 100 && context.responseLength < 500) {
    factors.push("appropriate response length");
  }
  if (context.hasProblematicKeywords) {
    factors.push("contains uncertainty keywords");
  }
  if (context.isFollowUp) {
    factors.push("complex multi-turn conversation");
  }
  if (context.ticketPriority === "URGENT") {
    factors.push("urgent priority ticket");
  }
  if (context.commentCount > 5) {
    factors.push("complex issue history");
  }

  return `Based on: ${factors.join(", ") || "baseline analysis"}`;
};
