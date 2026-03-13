import { ApiError } from "../../utils/errorHandler.js";
import {
  assignTicket,
  createTicketAttachment,
  createTicketActivityLog,
  createTicketComment,
  createTicket,
  deleteTicketAttachment,
  deleteTicketComment,
  getTicketAttachmentById,
  getTicketById,
  getTicketCommentById,
  getTicketComments,
  getTicketAttachments,
  getTicketOrganizationMembership,
  getTickets,
  updateTicketStatus,
  updateTicket,
} from "./ticket.repo.js";
import {
  TICKET_PRIORITIES,
  TICKET_ROLE_POLICIES,
  TICKET_SOURCES,
  TICKET_STATUSES,
} from "./ticket.constants.js";

const getTicketRolePolicy = (role) =>
  TICKET_ROLE_POLICIES[role] ?? TICKET_ROLE_POLICIES.MEMBER;

const canViewAllOrganizationTickets = (role) =>
  getTicketRolePolicy(role).canViewAll;

const canEditAllOrganizationTickets = (role) =>
  getTicketRolePolicy(role).canEditAll;

const canAssignOrganizationTickets = (role) =>
  getTicketRolePolicy(role).canAssign;

const canMemberViewTicket = (ticket, userId) =>
  ticket.createdById === userId || ticket.assignedToId === userId;

const normalizeTicketUpdateFields = (ticketData) => ({
  title: ticketData.title,
  description: ticketData.description,
  priority: ticketData.priority?.toUpperCase(),
  status: ticketData.status?.toUpperCase(),
  assignedToId: ticketData.assignedToId,
});

const getProvidedUpdateFields = (ticketData) =>
  Object.fromEntries(
    Object.entries(ticketData).filter(([, value]) => value !== undefined),
  );

const assertCanUpdateTicket = (membership, ticket, userId, updateData) => {
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

const filterInternalCommentsForRole = (ticket, role) => {
  if (canViewAllOrganizationTickets(role) || !ticket.comments) {
    return ticket;
  }

  return {
    ...ticket,
    comments: ticket.comments.filter((comment) => !comment.isInternal),
  };
};

const filterCommentsForRole = (comments, role) => {
  if (canViewAllOrganizationTickets(role)) {
    return comments;
  }

  return comments.filter((comment) => !comment.isInternal);
};

const canCreateInternalComment = (role) =>
  getTicketRolePolicy(role).canCreateInternalComment;

const canDeleteAnyTicketComment = (role) =>
  getTicketRolePolicy(role).canDeleteAnyComment;

const canDeleteAnyTicketAttachment = (role) =>
  getTicketRolePolicy(role).canDeleteAnyComment;

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

export const updateTicketService = async (ticketId, ticketData, userId) => {
  const normalizedUpdateData = getProvidedUpdateFields(
    normalizeTicketUpdateFields(ticketData),
  );
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(403, "You do not have permission to update this ticket");
  }

  assertCanUpdateTicket(membership, ticket, userId, normalizedUpdateData);

  await validateTicketAssignee(ticket.organizationId, normalizedUpdateData.assignedToId);

  const updatedTicket = await updateTicket(ticketId, normalizedUpdateData, userId);

  if (!updatedTicket || !updatedTicket.id) {
    throw new ApiError(500, "Failed to update ticket");
  }

  return filterInternalCommentsForRole(updatedTicket, membership.role);
};

export const assignTicketService = async (ticketId, assignedToId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id || !canAssignOrganizationTickets(membership.role)) {
    throw new ApiError(403, "You do not have permission to assign this ticket");
  }

  await validateTicketAssignee(ticket.organizationId, assignedToId);

  const updatedTicket = await assignTicket(
    ticketId,
    assignedToId,
    userId,
    ticket.assignedToId ?? null,
  );

  if (!updatedTicket || !updatedTicket.id) {
    throw new ApiError(500, "Failed to assign ticket");
  }

  return updatedTicket;
};

export const updateTicketStatusService = async (ticketId, status, userId) => {
  const normalizedStatus = status?.toUpperCase();
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id || !canEditAllOrganizationTickets(membership.role)) {
    throw new ApiError(
      403,
      "You do not have permission to update this ticket status",
    );
  }

  const updatedTicket = await updateTicketStatus(
    ticketId,
    normalizedStatus,
    userId,
    ticket.status,
  );

  if (!updatedTicket || !updatedTicket.id) {
    throw new ApiError(500, "Failed to update ticket status");
  }

  return updatedTicket;
};

export const createTicketCommentService = async (ticketId, commentData, userId) => {
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
      "You do not have permission to comment on this ticket",
    );
  }

  if (!canViewAllOrganizationTickets(membership.role) && !canMemberViewTicket(ticket, userId)) {
    throw new ApiError(
      403,
      "You do not have permission to comment on this ticket",
    );
  }

  const isInternal = commentData.isInternal === true;

  if (isInternal && !canCreateInternalComment(membership.role)) {
    throw new ApiError(
      403,
      "You do not have permission to create internal comments",
    );
  }

  const comment = await createTicketComment(ticketId, {
    authorId: userId,
    message: commentData.message,
    isInternal,
  });

  if (!comment || !comment.id) {
    throw new ApiError(500, "Failed to create ticket comment");
  }

  await createTicketActivityLog(ticketId, {
    actorId: userId,
    action: "COMMENT_ADDED",
    newValue: comment.message,
  });

  if (!canViewAllOrganizationTickets(membership.role) && comment.isInternal) {
    return {
      ...comment,
      isInternal: false,
    };
  }

  return comment;
};

export const getTicketCommentsService = async (ticketId, userId) => {
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
      "You do not have permission to view comments on this ticket",
    );
  }

  if (!canViewAllOrganizationTickets(membership.role) && !canMemberViewTicket(ticket, userId)) {
    throw new ApiError(
      403,
      "You do not have permission to view comments on this ticket",
    );
  }

  const comments = await getTicketComments(ticketId);

  return filterCommentsForRole(comments || [], membership.role);
};

export const deleteTicketCommentService = async (ticketId, commentId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const comment = await getTicketCommentById(commentId);

  if (!comment || !comment.id || comment.ticketId !== ticketId) {
    throw new ApiError(404, "Comment not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(
      403,
      "You do not have permission to delete comments on this ticket",
    );
  }

  if (
    !canDeleteAnyTicketComment(membership.role) &&
    (!canMemberViewTicket(ticket, userId) || comment.authorId !== userId)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to delete this comment",
    );
  }

  const deletedComment = await deleteTicketComment(commentId);

  if (!deletedComment || !deletedComment.id) {
    throw new ApiError(500, "Failed to delete ticket comment");
  }

  await createTicketActivityLog(ticketId, {
    actorId: userId,
    action: "COMMENT_DELETED",
    oldValue: deletedComment.message,
  });

  return deletedComment;
};

export const createTicketAttachmentService = async (
  ticketId,
  attachmentData,
  userId,
) => {
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
      "You do not have permission to add attachments to this ticket",
    );
  }

  if (!canViewAllOrganizationTickets(membership.role) && !canMemberViewTicket(ticket, userId)) {
    throw new ApiError(
      403,
      "You do not have permission to add attachments to this ticket",
    );
  }

  const attachment = await createTicketAttachment(ticketId, {
    uploadedBy: userId,
    fileUrl: attachmentData.fileUrl,
    fileType: attachmentData.fileType,
    fileSize: attachmentData.fileSize,
  });

  if (!attachment || !attachment.id) {
    throw new ApiError(500, "Failed to create ticket attachment");
  }

  await createTicketActivityLog(ticketId, {
    actorId: userId,
    action: "ATTACHMENT_ADDED",
    newValue: attachment.fileUrl,
  });

  return attachment;
};

export const getTicketAttachmentsService = async (ticketId, userId) => {
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
      "You do not have permission to view attachments on this ticket",
    );
  }

  if (!canViewAllOrganizationTickets(membership.role) && !canMemberViewTicket(ticket, userId)) {
    throw new ApiError(
      403,
      "You do not have permission to view attachments on this ticket",
    );
  }

  const attachments = await getTicketAttachments(ticketId);

  return attachments || [];
};

export const deleteTicketAttachmentService = async (
  ticketId,
  attachmentId,
  userId,
) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const attachment = await getTicketAttachmentById(attachmentId);

  if (!attachment || !attachment.id || attachment.ticketId !== ticketId) {
    throw new ApiError(404, "Attachment not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(
      403,
      "You do not have permission to delete attachments on this ticket",
    );
  }

  if (
    !canDeleteAnyTicketAttachment(membership.role) &&
    (!canMemberViewTicket(ticket, userId) || attachment.uploadedBy !== userId)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to delete this attachment",
    );
  }

  const deletedAttachment = await deleteTicketAttachment(attachmentId);

  if (!deletedAttachment || !deletedAttachment.id) {
    throw new ApiError(500, "Failed to delete ticket attachment");
  }

  await createTicketActivityLog(ticketId, {
    actorId: userId,
    action: "ATTACHMENT_DELETED",
    oldValue: deletedAttachment.fileUrl,
  });

  return deletedAttachment;
};
