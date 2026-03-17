import { ApiError } from "../../utils/errorHandler.js";
import {
  createNotifications,
  getNotificationsByRecipient,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "./notification.repo.js";
import { sendNotification } from "./notification.provider.js";

const dedupeRecipients = (recipientIds = []) => {
  return [...new Set(recipientIds.filter(Boolean))];
};

export const createInAppNotificationsService = async ({
  organizationId,
  ticketId = null,
  recipientIds,
  type,
  title,
  message,
  metadata = null,
}) => {
  const dedupedRecipientIds = dedupeRecipients(recipientIds);

  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  if (dedupedRecipientIds.length === 0) {
    return { count: 0 };
  }

  if (!type || !title || !message) {
    throw new ApiError(
      400,
      "Notification type, title, and message are required",
    );
  }

  const rows = dedupedRecipientIds.map((recipientId) => ({
    organizationId,
    ticketId,
    recipientId,
    type,
    title,
    message,
    metadata,
  }));

  return await createNotifications(rows);
};

export const sendForTicketEventService = async (notification) => {
  await sendNotification(notification);
};

export const listMyNotificationsService = async (recipientId, options = {}) => {
  if (!recipientId) {
    throw new ApiError(400, "Recipient ID is required");
  }

  return await getNotificationsByRecipient(recipientId, options);
};

export const markNotificationAsReadService = async (
  notificationId,
  recipientId,
) => {
  if (!notificationId || !recipientId) {
    throw new ApiError(400, "Notification ID and recipient ID are required");
  }

  const result = await markNotificationAsRead(notificationId, recipientId);

  if (result.count === 0) {
    throw new ApiError(404, "Notification not found");
  }

  return result;
};

export const markAllNotificationsAsReadService = async (recipientId) => {
  if (!recipientId) {
    throw new ApiError(400, "Recipient ID is required");
  }

  return await markAllNotificationsAsRead(recipientId);
};
