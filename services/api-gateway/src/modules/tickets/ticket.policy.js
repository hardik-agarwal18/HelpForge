import { ApiError } from "../../utils/errorHandler.js";
import { PERMISSIONS } from "../organization/org.constants.js";
import { extractPermissionValues } from "../organization/org.utils.js";

const has = (permissions, permission) =>
  extractPermissionValues(permissions).includes(permission);

export const canViewAllOrganizationTickets = (permissions) =>
  has(permissions, PERMISSIONS.TICKET_VIEW_ALL);

export const canEditAllOrganizationTickets = (permissions) =>
  has(permissions, PERMISSIONS.TICKET_EDIT_ALL);

export const canAssignOrganizationTickets = (permissions) =>
  has(permissions, PERMISSIONS.TICKET_ASSIGN);

export const canMemberViewTicket = (ticket, userId) =>
  ticket.createdById === userId || ticket.assignedToId === userId;

export const canCreateInternalComment = (permissions) =>
  has(permissions, PERMISSIONS.TICKET_CREATE_INTERNAL_COMMENT);

export const canDeleteAnyTicketComment = (permissions) =>
  has(permissions, PERMISSIONS.TICKET_DELETE_ANY_COMMENT);

export const canDeleteAnyTicketAttachment = (permissions) =>
  has(permissions, PERMISSIONS.TICKET_DELETE_ANY_ATTACHMENT);

export const assertCanUpdateTicket = (
  membership,
  ticket,
  userId,
  updateData,
) => {
  const permissions = membership.role?.permissions || [];

  if (canEditAllOrganizationTickets(permissions)) {
    return;
  }

  if (!canMemberViewTicket(ticket, userId)) {
    throw new ApiError(403, "You do not have permission to update this ticket", "TICKET_UPDATE_FORBIDDEN");
  }

  const allowedFields = ["title", "description", "priority"];
  const attemptedFields = Object.keys(updateData);

  if (!attemptedFields.every((field) => allowedFields.includes(field))) {
    throw new ApiError(
      403,
      "You can only update title, description, and priority on your own tickets",
      "TICKET_UPDATE_FORBIDDEN",
    );
  }
};
