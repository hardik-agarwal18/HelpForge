import { ApiError } from "../../utils/errorHandler.js";
import {
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUSES,
} from "./ticket.constants.js";
import { parseDateFilter } from "./ticket.utils.js";

export const buildCommonTicketFilters = (filters, userId) => {
  const resolvedAssignedToId =
    filters.assignedTo === "me"
      ? userId
      : (filters.assignedToId ?? filters.assignedTo);

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
    ...(filters.organizationId
      ? { organizationId: filters.organizationId }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(resolvedAssignedToId ? { assignedToId: resolvedAssignedToId } : {}),
    ...(Object.keys(tagFilter).length > 0 ? { tags: { some: tagFilter } } : {}),
    ...(Object.keys(createdAtFilter).length > 0
      ? { createdAt: createdAtFilter }
      : {}),
  };
};

export const validateListFilters = (filters, options = {}) => {
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
