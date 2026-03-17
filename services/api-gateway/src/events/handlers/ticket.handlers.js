import { createTicketActivityLog } from "../../modules/tickets/ticket.repo.js";
import logger from "../../config/logger.js";
import { registerAsyncHandler } from "../eventBus.js";
import {
  TICKET_ATTACHMENT_ADDED_EVENT,
  TICKET_ATTACHMENT_DELETED_EVENT,
  TICKET_ASSIGNED_EVENT,
  TICKET_COMMENT_ADDED_EVENT,
  TICKET_COMMENT_DELETED_EVENT,
  TICKET_CREATED_EVENT,
  TICKET_STATUS_CHANGED_EVENT,
  TICKET_TAG_ADDED_EVENT,
  TICKET_TAG_REMOVED_EVENT,
} from "../eventTypes.js";

const createActivityLogForEvent = async (payload, activityData) => {
  const { ticketId, organizationId, actorId } = payload;

  await createTicketActivityLog(ticketId, {
    actorId,
    ...activityData,
  });

  logger.debug(
    {
      event: activityData.action,
      ticketId,
      organizationId,
      actorId,
    },
    "Ticket activity recorded from event",
  );
};

registerAsyncHandler(TICKET_CREATED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "TICKET_CREATED",
    newValue: payload.metadata?.title ?? null,
  });
});

registerAsyncHandler(TICKET_ASSIGNED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "TICKET_ASSIGNED",
    oldValue: payload.metadata?.previousAssignedToId ?? null,
    newValue: payload.metadata?.assignedToId ?? null,
  });
});

registerAsyncHandler(TICKET_STATUS_CHANGED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "TICKET_STATUS_UPDATED",
    oldValue: payload.metadata?.previousStatus ?? null,
    newValue: payload.metadata?.status ?? null,
  });
});

registerAsyncHandler(TICKET_COMMENT_ADDED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "COMMENT_ADDED",
    newValue: payload.metadata?.message ?? null,
  });
});

registerAsyncHandler(TICKET_COMMENT_DELETED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "COMMENT_DELETED",
    oldValue: payload.metadata?.message ?? null,
  });
});

registerAsyncHandler(TICKET_TAG_ADDED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "TAG_ADDED",
    newValue: payload.metadata?.tagName ?? null,
  });
});

registerAsyncHandler(TICKET_TAG_REMOVED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "TAG_REMOVED",
    oldValue: payload.metadata?.tagName ?? null,
  });
});

registerAsyncHandler(TICKET_ATTACHMENT_ADDED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "ATTACHMENT_ADDED",
    newValue: payload.metadata?.fileUrl ?? null,
  });
});

registerAsyncHandler(TICKET_ATTACHMENT_DELETED_EVENT, async (payload) => {
  await createActivityLogForEvent(payload, {
    action: "ATTACHMENT_DELETED",
    oldValue: payload.metadata?.fileUrl ?? null,
  });
});
