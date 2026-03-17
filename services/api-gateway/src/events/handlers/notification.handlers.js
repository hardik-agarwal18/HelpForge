import logger from "../../config/logger.js";
import { NOTIFICATION_TYPES } from "../../modules/notifications/notification.constants.js";
import { createTicketEventNotificationService } from "../../modules/notifications/notification.service.js";
import { registerAsyncHandler } from "../eventBus.js";
import {
  TICKET_ASSIGNED_EVENT,
  TICKET_ATTACHMENT_ADDED_EVENT,
  TICKET_ATTACHMENT_DELETED_EVENT,
  TICKET_COMMENT_ADDED_EVENT,
  TICKET_COMMENT_DELETED_EVENT,
  TICKET_TAG_ADDED_EVENT,
  TICKET_TAG_REMOVED_EVENT,
} from "../eventTypes.js";

const registerTicketNotificationHandler = (eventName, config) => {
  registerAsyncHandler(eventName, async (payload) => {
    const result = await createTicketEventNotificationService({
      payload,
      ...config,
    });

    logger.info(
      {
        eventName,
        ticketId: payload.ticketId,
        organizationId: payload.organizationId,
        actorId: payload.actorId,
        notificationCount: result.count,
      },
      "Ticket notifications processed",
    );
  });
};

registerTicketNotificationHandler(TICKET_ASSIGNED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
  title: "Ticket assigned",
  message: "A ticket has been assigned.",
  recipientMode: "assigned-agent",
});

registerTicketNotificationHandler(TICKET_COMMENT_ADDED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_COMMENT_ADDED,
  title: "Comment added",
  message: "A comment was added to the ticket.",
});

registerTicketNotificationHandler(TICKET_COMMENT_DELETED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_COMMENT_DELETED,
  title: "Comment deleted",
  message: "A comment was deleted from the ticket.",
});

registerTicketNotificationHandler(TICKET_TAG_ADDED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_TAG_ADDED,
  title: "Tag added",
  message: "A tag was added to the ticket.",
});

registerTicketNotificationHandler(TICKET_TAG_REMOVED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_TAG_REMOVED,
  title: "Tag removed",
  message: "A tag was removed from the ticket.",
});

registerTicketNotificationHandler(TICKET_ATTACHMENT_ADDED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_ATTACHMENT_ADDED,
  title: "Attachment added",
  message: "An attachment was added to the ticket.",
});

registerTicketNotificationHandler(TICKET_ATTACHMENT_DELETED_EVENT, {
  type: NOTIFICATION_TYPES.TICKET_ATTACHMENT_DELETED,
  title: "Attachment deleted",
  message: "An attachment was removed from the ticket.",
});
