import logger from "../../config/logger.js";
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

registerAsyncHandler(TICKET_COMMENT_ADDED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      message: payload.metadata?.message ?? null,
    },
    "Notification should be sent for ticket comment added",
  );
});

registerAsyncHandler(TICKET_COMMENT_DELETED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      message: payload.metadata?.message ?? null,
    },
    "Notification should be sent for ticket comment deleted",
  );
});

registerAsyncHandler(TICKET_TAG_ADDED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      tagName: payload.metadata?.tagName ?? null,
    },
    "Notification should be sent for ticket tag added",
  );
});

registerAsyncHandler(TICKET_TAG_REMOVED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      tagName: payload.metadata?.tagName ?? null,
    },
    "Notification should be sent for ticket tag removed",
  );
});

registerAsyncHandler(TICKET_ATTACHMENT_ADDED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      fileUrl: payload.metadata?.fileUrl ?? null,
    },
    "Notification should be sent for ticket attachment added",
  );
});

registerAsyncHandler(TICKET_ATTACHMENT_DELETED_EVENT, async (payload) => {
  logger.info(
    {
      ticketId: payload.ticketId,
      organizationId: payload.organizationId,
      actorId: payload.actorId,
      fileUrl: payload.metadata?.fileUrl ?? null,
    },
    "Notification should be sent for ticket attachment deleted",
  );
});
