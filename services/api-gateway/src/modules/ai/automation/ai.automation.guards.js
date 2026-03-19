import logger from "../../../config/logger.js";
import {
  AI_MAX_MESSAGES_PER_TICKET,
  AI_COMMENT_COOLDOWN_MS,
} from "./ai.automation.constants.js";

/**
 * Single consolidated guard layer for all AI processing checks
 * Combines: aiActive, message budget, cooldown, and assignment state
 *
 * @param {Object} ticket - Ticket object with comments, aiActive, assignedToId, status
 * @returns {Object} { canProcess: boolean, reason: string }
 */
export const shouldProcessAI = (ticket) => {
  // Guard 1: Check if AI is enabled for this ticket
  if (!ticket.aiActive) {
    logger.info({ ticketId: ticket.id }, "AI guard: AI disabled for ticket");
    return { canProcess: false, reason: "AI_DISABLED" };
  }

  // Guard 2: Check message budget
  const aiResponseCount =
    typeof ticket.aiMessageCount === "number"
      ? ticket.aiMessageCount
      : ticket.comments.filter((c) => c.authorType === "AI").length;

  if (aiResponseCount >= AI_MAX_MESSAGES_PER_TICKET) {
    logger.info(
      { ticketId: ticket.id, aiResponseCount },
      "AI guard: max messages reached",
    );
    return { canProcess: false, reason: "MAX_MESSAGES_REACHED" };
  }

  // Guard 3: Check cooldown between AI responses
  const lastAiComment = [...ticket.comments]
    .reverse()
    .find((comment) => comment.authorType === "AI");

  if (lastAiComment?.createdAt) {
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
        "AI guard: cooldown period active",
      );
      return { canProcess: false, reason: "COOLDOWN_ACTIVE" };
    }
  }

  // Guard 4: Check if ticket is already assigned and in progress
  if (ticket.assignedToId && ticket.status === "IN_PROGRESS") {
    logger.info(
      { ticketId: ticket.id },
      "AI guard: ticket already in progress with assignment",
    );
    return { canProcess: false, reason: "ALREADY_IN_PROGRESS" };
  }

  // All guards passed
  return { canProcess: true, reason: "READY_TO_PROCESS" };
};
