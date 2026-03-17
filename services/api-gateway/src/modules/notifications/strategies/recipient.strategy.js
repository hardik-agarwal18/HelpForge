import {
  getOrganizationStaffRecipientIds,
  getTicketNotificationContext,
} from "../notification.repo.js";

const dedupe = (ids = []) => [...new Set(ids.filter(Boolean))];

export const resolveRecipientsForTicketEvent = async ({
  payload,
  recipientMode = "ticket-watchers",
}) => {
  if (!payload) {
    return {
      organizationId: null,
      recipientIds: [],
    };
  }

  if (recipientMode === "assigned-agent") {
    const assigneeId = payload.metadata?.assignedToId ?? null;

    return {
      organizationId: payload.organizationId ?? null,
      recipientIds: dedupe(assigneeId ? [assigneeId] : []),
    };
  }

  const ticket = await getTicketNotificationContext(payload.ticketId);

  if (!ticket || !ticket.id) {
    return {
      organizationId: payload.organizationId ?? null,
      recipientIds: [],
    };
  }

  const organizationId = payload.organizationId ?? ticket.organizationId;
  const staffRecipientIds =
    await getOrganizationStaffRecipientIds(organizationId);

  return {
    organizationId,
    recipientIds: dedupe([
      ticket.createdById,
      ticket.assignedToId,
      ...staffRecipientIds,
    ]),
  };
};

export default {
  resolveRecipientsForTicketEvent,
};
