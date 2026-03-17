import logger from "../../../config/logger.js";
import { createTicketEventNotificationService } from "../notification.service.js";

export const handleTicketNotificationEvent = async ({
  payload,
  type,
  title,
  message,
  recipientMode = "ticket-watchers",
}) => {
  try {
    return await createTicketEventNotificationService({
      payload,
      type,
      title,
      message,
      recipientMode,
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        ticketId: payload?.ticketId,
        organizationId: payload?.organizationId,
        actorId: payload?.actorId,
        type,
      },
      "Failed to process ticket notification event",
    );

    throw error;
  }
};

export default {
  handleTicketNotificationEvent,
};
