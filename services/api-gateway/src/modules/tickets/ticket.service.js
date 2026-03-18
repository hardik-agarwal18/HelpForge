import { ApiError } from "../../utils/errorHandler.js";
import { emitTicketEvent } from "../../events/ticket.events.js";
import {
  TICKET_ATTACHMENT_ADDED_EVENT,
  TICKET_ATTACHMENT_DELETED_EVENT,
  TICKET_ASSIGNED_EVENT,
  TICKET_COMMENT_ADDED_EVENT,
  TICKET_COMMENT_DELETED_EVENT,
  TICKET_CREATED_EVENT,
  TICKET_STATUS_CHANGED_EVENT,
  TICKET_TAG_ADDED_EVENT,
  TICKET_TAG_REMOVED_EVENT,
} from "../../events/eventTypes.js";
import {
  assignTicket,
  addTagToTicket,
  createTag,
  createTicketAttachment,
  createTicketComment,
  createTicket,
  deleteTicketTag,
  deleteTicketAttachment,
  deleteTicketComment,
  getTagById,
  getTagByName,
  getTicketAttachmentById,
  getTicketById,
  getTicketCommentById,
  getTicketTagById,
  getTicketActivities,
  getTicketComments,
  getTicketAttachments,
  getTicketOrganizationMembership,
  getTicketMembershipsByUserId,
  getTickets,
  getAgentTickets,
  getTags,
  updateAgentAvailability,
  updateTicketStatus,
  updateTicket,
} from "./ticket.repo.js";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "./ticket.constants.js";
import {
  assertCanUpdateTicket,
  canAssignOrganizationTickets,
  canCreateInternalComment,
  canDeleteAnyTicketAttachment,
  canDeleteAnyTicketComment,
  canEditAllOrganizationTickets,
  canMemberViewTicket,
  canViewAllOrganizationTickets,
} from "./ticket.policy.js";
import {
  getProvidedUpdateFields,
  normalizeTagName,
  normalizeTicketFields,
  normalizeTicketFilters,
  normalizeTicketUpdateFields,
} from "./ticket.utils.js";
import {
  buildCommonTicketFilters,
  validateListFilters,
} from "./ticket.filters.js";
import { autoAssignTicketForOrganization } from "./ticket.autoAssign.js";

const STAFF_ROLES = ["OWNER", "ADMIN", "AGENT"];

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

const getStaffMemberships = async (userId) => {
  const memberships = await getTicketMembershipsByUserId(userId);
  return memberships.filter((membership) =>
    STAFF_ROLES.includes(membership.role),
  );
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
    throw new ApiError(
      400,
      "Assigned user must be a member of the organization",
    );
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

  emitTicketEvent(TICKET_CREATED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      title: ticket.title,
    },
  });

  if (ticket.assignedToId) {
    return ticket;
  }

  try {
    return await autoAssignTicketForOrganization(ticket);
  } catch (error) {
    if (error.statusCode === 409) {
      return ticket;
    }

    throw error;
  }
};

export const autoAssignTicketService = async (ticketId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (
    !membership ||
    !membership.id ||
    !canAssignOrganizationTickets(membership.role)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to auto-assign this ticket",
    );
  }

  return await autoAssignTicketForOrganization(ticket);
};

export const createTagService = async (tagData, userId) => {
  const membership = await getTicketOrganizationMembership(
    tagData.organizationId,
    userId,
  );

  if (
    !membership ||
    !membership.id ||
    !canEditAllOrganizationTickets(membership.role)
  ) {
    throw new ApiError(403, "You do not have permission to create tags");
  }

  const normalizedName = normalizeTagName(tagData.name);
  const existingTag = await getTagByName(
    tagData.organizationId,
    normalizedName,
  );

  if (existingTag && existingTag.id) {
    throw new ApiError(409, "Tag already exists in this organization");
  }

  const tag = await createTag({
    organizationId: tagData.organizationId,
    name: normalizedName,
  });

  if (!tag || !tag.id) {
    throw new ApiError(500, "Failed to create tag");
  }

  return tag;
};

export const getTagsService = async (organizationId, userId) => {
  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  const membership = await getTicketOrganizationMembership(
    organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(403, "You do not have permission to view tags");
  }

  const tags = await getTags(organizationId);

  return tags || [];
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

  const baseFilters = buildCommonTicketFilters(normalizedFilters, userId);

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

export const getMyAgentTicketsService = async (query, userId) => {
  const normalizedFilters = normalizeTicketFilters(query);
  validateListFilters(normalizedFilters, { requireOrganizationId: false });

  const staffMemberships = await getStaffMemberships(userId);

  if (staffMemberships.length === 0) {
    throw new ApiError(
      403,
      "You do not have permission to view assigned agent tickets",
    );
  }

  const organizationIds = staffMemberships.map(
    (membership) => membership.organizationId,
  );

  if (
    normalizedFilters.organizationId &&
    !organizationIds.includes(normalizedFilters.organizationId)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to view assigned agent tickets",
    );
  }

  const tickets = await getAgentTickets({
    ...buildCommonTicketFilters(
      {
        ...normalizedFilters,
        assignedTo: "me",
      },
      userId,
    ),
    organizationId: normalizedFilters.organizationId
      ? normalizedFilters.organizationId
      : { in: organizationIds },
  });

  return tickets || [];
};

export const getMyAgentStatsService = async (query, userId) => {
  const tickets = await getMyAgentTicketsService(query, userId);

  const byStatus = Object.fromEntries(
    TICKET_STATUSES.map((status) => [status, 0]),
  );
  const byPriority = Object.fromEntries(
    TICKET_PRIORITIES.map((priority) => [priority, 0]),
  );

  tickets.forEach((ticket) => {
    byStatus[ticket.status] += 1;
    byPriority[ticket.priority] += 1;
  });

  return {
    totalAssigned: tickets.length,
    byStatus,
    byPriority,
  };
};

export const updateMyAgentAvailabilityService = async (
  organizationId,
  isAvailable,
  userId,
) => {
  const membership = await getTicketOrganizationMembership(
    organizationId,
    userId,
  );

  if (!membership || !membership.id) {
    throw new ApiError(
      403,
      "You do not have permission to update agent availability for this organization",
    );
  }

  if (membership.role !== "AGENT") {
    throw new ApiError(403, "Only agents can update their availability");
  }

  const updatedMembership = await updateAgentAvailability(
    organizationId,
    userId,
    isAvailable,
  );

  if (!updatedMembership || !updatedMembership.id) {
    throw new ApiError(500, "Failed to update agent availability");
  }

  return updatedMembership;
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
    throw new ApiError(403, "You do not have permission to view this ticket");
  }

  if (
    !canViewAllOrganizationTickets(membership.role) &&
    !canMemberViewTicket(ticket, userId)
  ) {
    throw new ApiError(403, "You do not have permission to view this ticket");
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

  await validateTicketAssignee(
    ticket.organizationId,
    normalizedUpdateData.assignedToId,
  );

  const updatedTicket = await updateTicket(
    ticketId,
    normalizedUpdateData,
    userId,
  );

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

  if (
    !membership ||
    !membership.id ||
    !canAssignOrganizationTickets(membership.role)
  ) {
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

  emitTicketEvent(TICKET_ASSIGNED_EVENT, {
    ticketId: updatedTicket.id,
    organizationId: updatedTicket.organizationId,
    actorId: userId,
    metadata: {
      previousAssignedToId: ticket.assignedToId ?? null,
      assignedToId: updatedTicket.assignedToId ?? null,
    },
  });

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

  if (
    !membership ||
    !membership.id ||
    !canEditAllOrganizationTickets(membership.role)
  ) {
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

  emitTicketEvent(TICKET_STATUS_CHANGED_EVENT, {
    ticketId: updatedTicket.id,
    organizationId: updatedTicket.organizationId,
    actorId: userId,
    metadata: {
      previousStatus: ticket.status,
      status: updatedTicket.status,
    },
  });

  return updatedTicket;
};

export const createTicketCommentService = async (
  ticketId,
  commentData,
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
      "You do not have permission to comment on this ticket",
    );
  }

  if (
    !canViewAllOrganizationTickets(membership.role) &&
    !canMemberViewTicket(ticket, userId)
  ) {
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
    authorType: "USER",
    message: commentData.message,
    isInternal,
  });

  if (!comment || !comment.id) {
    throw new ApiError(500, "Failed to create ticket comment");
  }

  emitTicketEvent(TICKET_COMMENT_ADDED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      message: comment.message,
    },
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

  if (
    !canViewAllOrganizationTickets(membership.role) &&
    !canMemberViewTicket(ticket, userId)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to view comments on this ticket",
    );
  }

  const comments = await getTicketComments(ticketId);

  return filterCommentsForRole(comments || [], membership.role);
};

export const getTicketActivitiesService = async (ticketId, userId) => {
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
      "You do not have permission to view activity on this ticket",
    );
  }

  if (
    !canViewAllOrganizationTickets(membership.role) &&
    !canMemberViewTicket(ticket, userId)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to view activity on this ticket",
    );
  }

  const activities = await getTicketActivities(ticketId);

  return activities || [];
};

export const deleteTicketCommentService = async (
  ticketId,
  commentId,
  userId,
) => {
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

  emitTicketEvent(TICKET_COMMENT_DELETED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      message: deletedComment.message,
    },
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

  if (
    !canViewAllOrganizationTickets(membership.role) &&
    !canMemberViewTicket(ticket, userId)
  ) {
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

  emitTicketEvent(TICKET_ATTACHMENT_ADDED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      fileUrl: attachment.fileUrl,
    },
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

  if (
    !canViewAllOrganizationTickets(membership.role) &&
    !canMemberViewTicket(ticket, userId)
  ) {
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

  emitTicketEvent(TICKET_ATTACHMENT_DELETED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      fileUrl: deletedAttachment.fileUrl,
    },
  });

  return deletedAttachment;
};

export const addTicketTagService = async (ticketId, tagId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (
    !membership ||
    !membership.id ||
    !canEditAllOrganizationTickets(membership.role)
  ) {
    throw new ApiError(403, "You do not have permission to tag this ticket");
  }

  const tag = await getTagById(tagId);

  if (!tag || !tag.id || tag.organizationId !== ticket.organizationId) {
    throw new ApiError(404, "Tag not found");
  }

  const existingTicketTag = await getTicketTagById(ticketId, tagId);

  if (existingTicketTag && existingTicketTag.tagId) {
    throw new ApiError(409, "Tag already added to this ticket");
  }

  const ticketTag = await addTagToTicket(ticketId, tagId);

  if (!ticketTag || !ticketTag.tagId) {
    throw new ApiError(500, "Failed to add tag to ticket");
  }

  emitTicketEvent(TICKET_TAG_ADDED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      tagName: ticketTag.tag.name,
    },
  });

  return ticketTag;
};

export const deleteTicketTagService = async (ticketId, tagId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (
    !membership ||
    !membership.id ||
    !canEditAllOrganizationTickets(membership.role)
  ) {
    throw new ApiError(
      403,
      "You do not have permission to remove tags from this ticket",
    );
  }

  const ticketTag = await getTicketTagById(ticketId, tagId);

  if (!ticketTag || !ticketTag.tagId) {
    throw new ApiError(404, "Tag not found on this ticket");
  }

  const deletedTicketTag = await deleteTicketTag(ticketId, tagId);

  if (!deletedTicketTag || !deletedTicketTag.tagId) {
    throw new ApiError(500, "Failed to remove tag from ticket");
  }

  emitTicketEvent(TICKET_TAG_REMOVED_EVENT, {
    ticketId: ticket.id,
    organizationId: ticket.organizationId,
    actorId: userId,
    metadata: {
      tagName: deletedTicketTag.tag.name,
    },
  });

  return deletedTicketTag;
};
