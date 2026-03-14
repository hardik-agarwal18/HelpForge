import logger from "../../config/logger.js";
import { registerAsyncHandler } from "../eventBus.js";

registerAsyncHandler("ticket.*", async (payload) => {
  logger.debug(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      metadata: payload.metadata,
    },
    "Ticket analytics event captured",
  );
});
