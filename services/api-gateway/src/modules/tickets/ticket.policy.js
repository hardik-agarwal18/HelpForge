import { ApiError } from "../../utils/errorHandler.js";
import { TICKET_ROLE_POLICIES } from "./ticket.constants.js";

export const getTicketRolePolicy = (role) =>
  TICKET_ROLE_POLICIES[role] ?? TICKET_ROLE_POLICIES.MEMBER;

export const canViewAllOrganizationTickets = (role) =>
  getTicketRolePolicy(role).canViewAll;

export const canEditAllOrganizationTickets = (role) =>
  getTicketRolePolicy(role).canEditAll;

export const canAssignOrganizationTickets = (role) =>
  getTicketRolePolicy(role).canAssign;

export const canMemberViewTicket = (ticket, userId) =>
  ticket.createdById === userId || ticket.assignedToId === userId;

export const canCreateInternalComment = (role) =>
  getTicketRolePolicy(role).canCreateInternalComment;

export const canDeleteAnyTicketComment = (role) =>
  getTicketRolePolicy(role).canDeleteAnyComment;

export const canDeleteAnyTicketAttachment = (role) =>
  getTicketRolePolicy(role).canDeleteAnyComment;

export const assertCanUpdateTicket = (
  membership,
  ticket,
  userId,
  updateData,
) => {
  if (canEditAllOrganizationTickets(membership.role)) {
    return;
  }

  if (membership.role !== "MEMBER" || ticket.createdById !== userId) {
    throw new ApiError(403, "You do not have permission to update this ticket");
  }

  const allowedFields = ["title", "description", "priority"];
  const attemptedFields = Object.keys(updateData);

  if (!attemptedFields.every((field) => allowedFields.includes(field))) {
    throw new ApiError(
      403,
      "Members can only update title, description, and priority on their own tickets",
    );
  }
};
