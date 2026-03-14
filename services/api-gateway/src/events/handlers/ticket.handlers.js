import { createTicketActivityLog } from "../../modules/tickets/ticket.repo.js";
import logger from "../../config/logger.js";
import { registerAsyncHandler } from "../eventBus.js";
import {
  TICKET_ASSIGNED_EVENT,
  TICKET_CREATED_EVENT,
  TICKET_STATUS_CHANGED_EVENT,
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
