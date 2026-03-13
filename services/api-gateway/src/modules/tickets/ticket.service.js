import { ApiError } from "../../utils/errorHandler.js";
import { createTicket, getTicketOrganizationMembership } from "./ticket.repo.js";

const normalizeTicketFields = (ticketData) => ({
  ...ticketData,
  priority: ticketData.priority?.toUpperCase(),
  source: ticketData.source?.toUpperCase(),
});

const validateTicketAssignee = async (organizationId, assignedToId) => {
  if (!assignedToId) {
    return;
  }

  const assignedMembership = await getTicketOrganizationMembership(
    organizationId,
    assignedToId,
  );

  if (!assignedMembership || !assignedMembership.id) {
    throw new ApiError(400, "Assigned user must be a member of the organization");
  }
};

export const createTicketService = async (ticketData, userId) => {
  const normalizedTicketData = normalizeTicketFields(ticketData);
  const membership = await getTicketOrganizationMembership(
    normalizedTicketData.organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(
      403,
      "You do not have permission to create tickets for this organization",
    );
  }

  await validateTicketAssignee(
    normalizedTicketData.organizationId,
    normalizedTicketData.assignedToId,
  );

  const ticket = await createTicket({
    ...normalizedTicketData,
    createdById: userId,
  });

  if (!ticket || !ticket.id) {
    throw new ApiError(500, "Failed to create ticket");
  }

  return ticket;
};
