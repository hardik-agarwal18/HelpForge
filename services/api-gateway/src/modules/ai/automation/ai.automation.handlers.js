import logger from "../../../config/logger.js";
import { handleCommentAdded } from "./ai.automation.service.js";
import { TICKET_COMMENT_ADDED_EVENT } from "../../../events/eventTypes.js";
import { registerAsyncHandler } from "../../../events/eventBus.js";
import { enqueueAICommentProcessing } from "./queue/ai.automation.queue.js";

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

    const queueResult = await enqueueAICommentProcessing(payload);

    if (queueResult.queued) {
      logger.info(
        { payload, jobId: queueResult.jobId },
        "AI Handler: Queued comment for AI processing",
      );
      return;
    }

    logger.warn(
      { payload },
      "AI Handler: Queue unavailable, processing comment inline",
    );
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
