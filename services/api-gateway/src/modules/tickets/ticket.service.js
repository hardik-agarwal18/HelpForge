import { ApiError } from "../../utils/errorHandler.js";
import eventBus from "../../events/eventBus.js";
import {
  TICKET_ASSIGNED_EVENT,
  TICKET_CREATED_EVENT,
  TICKET_STATUS_CHANGED_EVENT,
} from "../../events/eventTypes.js";
import {
  assignTicket,
  addTagToTicket,
  autoAssignTicket,
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
  getOrganizationAvailableAgents,
  getOrganizationAgentWorkloads,
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

const emitTicketEvent = (eventName, payload) => {
  eventBus.emit(eventName, payload);
};

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

const getWorkloadMap = (workloads) =>
  new Map(workloads.map((workload) => [workload.userId, workload]));

const startOfDay = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const startOfWeek = (date) => {
  const normalized = startOfDay(date);
  const day = normalized.getDay();
  const diff = day === 0 ? 6 : day - 1;
  normalized.setDate(normalized.getDate() - diff);
  return normalized;
};

const getEffectiveWorkload = (workload, now) => {
  if (!workload) {
    return {
      assignedToday: 0,
      assignedThisWeek: 0,
    };
  }

  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const lastDailyReset = workload.lastDailyReset
    ? new Date(workload.lastDailyReset)
    : null;
  const lastWeeklyReset = workload.lastWeeklyReset
    ? new Date(workload.lastWeeklyReset)
    : null;

  return {
    assignedToday:
      lastDailyReset && lastDailyReset >= dayStart ? workload.assignedToday : 0,
    assignedThisWeek:
      lastWeeklyReset && lastWeeklyReset >= weekStart
        ? workload.assignedThisWeek
        : 0,
  };
};

const isEligibleForAutoAssignment = (membership, workload, now) => {
  const effectiveWorkload = getEffectiveWorkload(workload, now);

  if (
    membership.maxTicketsPerDay !== null &&
    membership.maxTicketsPerDay !== undefined &&
    effectiveWorkload.assignedToday >= membership.maxTicketsPerDay
  ) {
    return false;
  }

  if (
    membership.maxTicketsPerWeek !== null &&
    membership.maxTicketsPerWeek !== undefined &&
    effectiveWorkload.assignedThisWeek >= membership.maxTicketsPerWeek
  ) {
    return false;
  }

  return true;
};

const findBestAutoAssignAgent = async (organizationId) => {
  const [agents, workloads] = await Promise.all([
    getOrganizationAvailableAgents(organizationId),
    getOrganizationAgentWorkloads(organizationId),
  ]);
  const now = new Date();
  const workloadMap = getWorkloadMap(workloads);
  const eligibleAgents = agents.filter((membership) =>
    isEligibleForAutoAssignment(
      membership,
      workloadMap.get(membership.userId),
      now,
    ),
  );

  if (eligibleAgents.length === 0) {
    return null;
  }

  const [leastLoadedAgent] = eligibleAgents.sort((left, right) => {
    const leftWorkload = getEffectiveWorkload(
      workloadMap.get(left.userId),
      now,
    );
    const rightWorkload = getEffectiveWorkload(
      workloadMap.get(right.userId),
      now,
    );

    if (leftWorkload.assignedToday !== rightWorkload.assignedToday) {
      return leftWorkload.assignedToday - rightWorkload.assignedToday;
    }

    return leftWorkload.assignedThisWeek - rightWorkload.assignedThisWeek;
  });

  return leastLoadedAgent.userId;
};

const autoAssignTicketForOrganization = async (ticket, actorId) => {
  const autoAssignedUserId = await findBestAutoAssignAgent(ticket.organizationId);

  if (!autoAssignedUserId) {
    throw new ApiError(409, "No available agent found for auto-assignment");
  }

  const autoAssignedTicket = await autoAssignTicket(
    ticket.id,
    ticket.organizationId,
    autoAssignedUserId,
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
