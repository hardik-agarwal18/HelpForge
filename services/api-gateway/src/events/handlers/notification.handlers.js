import logger from "../../config/logger.js";
import { registerAsyncHandler } from "../eventBus.js";
import { TICKET_ASSIGNED_EVENT } from "../eventTypes.js";

registerAsyncHandler(TICKET_ASSIGNED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      assignedToId: payload.metadata?.assignedToId ?? null,
    },
    "Notification should be sent to the assigned agent",
  );
});
