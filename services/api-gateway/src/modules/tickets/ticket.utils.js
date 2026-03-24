import { ApiError } from "../../utils/errorHandler.js";

export const normalizeTicketUpdateFields = (ticketData) => ({
  title: ticketData.title,
  description: ticketData.description,
  priority: ticketData.priority?.toUpperCase(),
  status: ticketData.status?.toUpperCase(),
  assignedToId: ticketData.assignedToId,
});

export const getProvidedUpdateFields = (ticketData) =>
  Object.fromEntries(
    Object.entries(ticketData).filter(([, value]) => value !== undefined),
  );

export const normalizeTagName = (name) => name.trim();

export const normalizeTicketFields = (ticketData) => ({
  ...ticketData,
  priority: ticketData.priority?.toUpperCase(),
  source: ticketData.source?.toUpperCase(),
});

export const normalizeTicketFilters = (filters) => ({
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

export const parseDateFilter = (value, fieldName) => {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, `Invalid ${fieldName}`, "INVALID_DATE");
  }

  return parsedDate;
};

export const startOfDay = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export const startOfWeek = (date) => {
  const normalized = startOfDay(date);
  const day = normalized.getDay();
  const diff = day === 0 ? 6 : day - 1;
  normalized.setDate(normalized.getDate() - diff);
  return normalized;
};
