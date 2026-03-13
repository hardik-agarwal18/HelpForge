import { ApiError } from "../../utils/errorHandler.js";
import {
  createTicket,
  getTicketById,
  getTicketOrganizationMembership,
  getTickets,
} from "./ticket.repo.js";
import {
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUSES,
} from "./ticket.constants.js";

const canViewAllOrganizationTickets = (role) =>
  ["OWNER", "ADMIN", "AGENT"].includes(role);

const canMemberViewTicket = (ticket, userId) =>
  ticket.createdById === userId || ticket.assignedToId === userId;

const filterInternalCommentsForRole = (ticket, role) => {
  if (canViewAllOrganizationTickets(role) || !ticket.comments) {
    return ticket;
  }

  return {
    ...ticket,
    comments: ticket.comments.filter((comment) => !comment.isInternal),
  };
};

const normalizeTicketFields = (ticketData) => ({
  ...ticketData,
  priority: ticketData.priority?.toUpperCase(),
  source: ticketData.source?.toUpperCase(),
});

const normalizeTicketFilters = (filters) => ({
  organizationId: filters.organizationId,
  status: filters.status?.toUpperCase(),
  priority: filters.priority?.toUpperCase(),
  source: filters.source?.toUpperCase(),
  assignedToId: filters.assignedToId,
});

const validateListFilters = (filters) => {
  if (!filters.organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  if (filters.status && !TICKET_STATUSES.includes(filters.status)) {
    throw new ApiError(400, "Invalid status");
  }

  if (filters.priority && !TICKET_PRIORITIES.includes(filters.priority)) {
    throw new ApiError(400, "Invalid priority");
  }

  if (filters.source && !TICKET_SOURCES.includes(filters.source)) {
    throw new ApiError(400, "Invalid source");
  }
};

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

export const getTicketsService = async (query, userId) => {
  const normalizedFilters = normalizeTicketFilters(query);
  validateListFilters(normalizedFilters);

  const membership = await getTicketOrganizationMembership(
    normalizedFilters.organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(
      403,
      "You do not have permission to view tickets for this organization",
    );
  }

  const baseFilters = {
    organizationId: normalizedFilters.organizationId,
    ...(normalizedFilters.status ? { status: normalizedFilters.status } : {}),
    ...(normalizedFilters.priority
      ? { priority: normalizedFilters.priority }
      : {}),
    ...(normalizedFilters.source ? { source: normalizedFilters.source } : {}),
    ...(normalizedFilters.assignedToId
      ? { assignedToId: normalizedFilters.assignedToId }
      : {}),
  };

  const tickets = await getTickets({
    ...baseFilters,
    ...(!canViewAllOrganizationTickets(membership.role)
      ? {
          OR: [{ createdById: userId }, { assignedToId: userId }],
        }
      : {}),
  });

  return tickets || [];
};

export const getTicketByIdService = async (ticketId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(
      403,
      "You do not have permission to view this ticket",
    );
  }

  if (!canViewAllOrganizationTickets(membership.role) && !canMemberViewTicket(ticket, userId)) {
    throw new ApiError(
      403,
      "You do not have permission to view this ticket",
    );
  }

  return filterInternalCommentsForRole(ticket, membership.role);
};
