import { ApiError } from "../../utils/errorHandler.js";
import {
  assignTicket,
  addTagToTicket,
  createTag,
  createTicketAttachment,
  createTicketActivityLog,
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
  getOrganizationAgentsWithLoad,
  getTicketOrganizationMembership,
  getTicketMembershipsByUserId,
  getTickets,
  getAgentTickets,
  getTags,
  updateAgentAvailability,
  updateTicketStatus,
  updateTicket,
} from "./ticket.repo.js";
import {
  AUTO_ASSIGNABLE_STATUSES,
  AUTO_ASSIGNMENT_MAX_ACTIVE_TICKETS,
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

const STAFF_ROLES = ["OWNER", "ADMIN", "AGENT"];

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

const normalizeTagName = (name) => name.trim();

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
  assignedTo: filters.assignedTo,
  assignedToId: filters.assignedToId,
  tag: filters.tag?.trim(),
  tagId: filters.tagId,
  dateFrom: filters.dateFrom,
  dateTo: filters.dateTo,
  organizationId: filters.organizationId,
});

const buildCommonTicketFilters = (filters, userId) => {
  const resolvedAssignedToId =
    filters.assignedTo === "me"
      ? userId
      : filters.assignedToId ?? filters.assignedTo;

  const createdAtFilter = {};
  const parsedDateFrom = parseDateFilter(filters.dateFrom, "dateFrom");
  const parsedDateTo = parseDateFilter(filters.dateTo, "dateTo");
  const tagFilter = {};

  if (parsedDateFrom) {
    createdAtFilter.gte = parsedDateFrom;
  }

  if (parsedDateTo) {
    createdAtFilter.lte = parsedDateTo;
  }

  if (filters.tagId) {
    tagFilter.tagId = filters.tagId;
  }

  if (filters.tag) {
    tagFilter.tag = { name: filters.tag };
  }

  return {
    ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(resolvedAssignedToId ? { assignedToId: resolvedAssignedToId } : {}),
    ...(Object.keys(tagFilter).length > 0
      ? { tags: { some: tagFilter } }
      : {}),
    ...(Object.keys(createdAtFilter).length > 0
      ? { createdAt: createdAtFilter }
      : {}),
  };
};

const getStaffMemberships = async (userId) => {
  const memberships = await getTicketMembershipsByUserId(userId);
  return memberships.filter((membership) => STAFF_ROLES.includes(membership.role));
};

const parseDateFilter = (value, fieldName) => {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  return parsedDate;
};

const validateListFilters = (filters, options = {}) => {
  const { requireOrganizationId = true } = options;

  if (requireOrganizationId && !filters.organizationId) {
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

  const dateFrom = parseDateFilter(filters.dateFrom, "dateFrom");
  const dateTo = parseDateFilter(filters.dateTo, "dateTo");

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiError(400, "dateFrom cannot be after dateTo");
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

const findBestAutoAssignAgent = async (organizationId) => {
  const agents = await getOrganizationAgentsWithLoad(
    organizationId,
    AUTO_ASSIGNABLE_STATUSES,
  );

  const availableAgents = agents.filter(
    (membership) =>
      membership.user &&
      membership.user.assignedTickets.length < AUTO_ASSIGNMENT_MAX_ACTIVE_TICKETS,
  );

  if (availableAgents.length === 0) {
    return null;
  }

  const [leastLoadedAgent] = availableAgents.sort(
    (left, right) =>
      left.user.assignedTickets.length - right.user.assignedTickets.length,
  );

  return leastLoadedAgent.userId;
};

const autoAssignTicketForOrganization = async (ticket, actorId) => {
  const autoAssignedUserId = await findBestAutoAssignAgent(ticket.organizationId);

  if (!autoAssignedUserId) {
    throw new ApiError(409, "No available agent found for auto-assignment");
  }

  const autoAssignedTicket = await assignTicket(
    ticket.id,
    autoAssignedUserId,
    actorId,
    ticket.assignedToId ?? null,
  );

  if (!autoAssignedTicket || !autoAssignedTicket.id) {
    throw new ApiError(500, "Failed to auto-assign ticket");
  }

  return autoAssignedTicket;
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

  if (ticket.assignedToId) {
    return ticket;
  }

  try {
    return await autoAssignTicketForOrganization(ticket, userId);
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

  if (!membership || !membership.id || !canAssignOrganizationTickets(membership.role)) {
    throw new ApiError(403, "You do not have permission to auto-assign this ticket");
  }

  return await autoAssignTicketForOrganization(ticket, userId);
};

export const createTagService = async (tagData, userId) => {
  const membership = await getTicketOrganizationMembership(
    tagData.organizationId,
    userId,
  );

  if (!membership || !membership.id || !canEditAllOrganizationTickets(membership.role)) {
    throw new ApiError(403, "You do not have permission to create tags");
  }

  const normalizedName = normalizeTagName(tagData.name);
  const existingTag = await getTagByName(tagData.organizationId, normalizedName);

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
    throw new ApiError(403, "You do not have permission to view assigned agent tickets");
  }

  const organizationIds = staffMemberships.map((membership) => membership.organizationId);

  if (
    normalizedFilters.organizationId &&
    !organizationIds.includes(normalizedFilters.organizationId)
  ) {
    throw new ApiError(403, "You do not have permission to view assigned agent tickets");
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

  const byStatus = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0]));
  const byPriority = Object.fromEntries(TICKET_PRIORITIES.map((priority) => [priority, 0]));

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
  const membership = await getTicketOrganizationMembership(organizationId, userId);

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

  if (!canViewAllOrganizationTickets(membership.role) && !canMemberViewTicket(ticket, userId)) {
    throw new ApiError(
      403,
      "You do not have permission to view activity on this ticket",
    );
  }

  const activities = await getTicketActivities(ticketId);

  return activities || [];
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

export const addTicketTagService = async (ticketId, tagId, userId) => {
  const ticket = await getTicketById(ticketId);

  if (!ticket || !ticket.id) {
    throw new ApiError(404, "Ticket not found");
  }

  const membership = await getTicketOrganizationMembership(
    ticket.organizationId,
    userId,
  );

  if (!membership || !membership.id || !canEditAllOrganizationTickets(membership.role)) {
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

  await createTicketActivityLog(ticketId, {
    actorId: userId,
    action: "TAG_ADDED",
    newValue: ticketTag.tag.name,
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

  if (!membership || !membership.id || !canEditAllOrganizationTickets(membership.role)) {
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

  await createTicketActivityLog(ticketId, {
    actorId: userId,
    action: "TAG_REMOVED",
    oldValue: deletedTicketTag.tag.name,
  });

  return deletedTicketTag;
};
