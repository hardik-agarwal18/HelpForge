import logger from "../../config/logger.js";
import { handleCommentAdded } from "./ai.service.js";
import { TICKET_COMMENT_ADDED_EVENT } from "../../events/eventTypes.js";
import { registerAsyncHandler } from "../../events/eventBus.js";

/**
 * AI Event Handlers - Listens to ticket events and triggers AI operations
 */

/**
 * Handle ticket comment added event
 * Triggers AI response generation if conditions are met
 */
export const handleTicketCommentAdded = async (payload) => {
  try {
    logger.debug(
      { payload },
      "AI Handler: Received TICKET_COMMENT_ADDED event",
    );

    // Process AI response asynchronously
    await handleCommentAdded(payload);
  } catch (error) {
    logger.error({ error, payload }, "Error in handleTicketCommentAdded");
  }
};

/**
 * Register all AI event handlers
 */
registerAsyncHandler(TICKET_COMMENT_ADDED_EVENT, handleTicketCommentAdded);

logger.info("AI event handlers registered");

export default {
  handleTicketCommentAdded,
};
