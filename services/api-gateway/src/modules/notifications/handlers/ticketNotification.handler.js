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
    if (error?.code === "P2003") {
      logger.warn(
        {
          errorCode: error.code,
          foreignKey: error.meta?.field_name,
          ticketId: payload?.ticketId,
          organizationId: payload?.organizationId,
          actorId: payload?.actorId,
          type,
        },
        "Skipping stale ticket notification event after FK race",
      );

      return { count: 0 };
    }

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
