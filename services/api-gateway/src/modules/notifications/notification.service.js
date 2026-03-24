import { ApiError } from "../../utils/errorHandler.js";
import {
  createNotifications,
  getNotificationPreferenceByUserId,
  getNotificationsByRecipient,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  upsertNotificationPreferenceByUserId,
} from "./notification.repo.js";
import { enqueueNotification } from "./queue/notification.queue.js";
import { resolveRecipientsForTicketEvent } from "./strategies/recipient.strategy.js";
import { applyRecipientPreferences } from "./strategies/preference.strategy.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notification.constants.js";

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
    throw new ApiError(400, "Organization ID is required", "ORG_ID_REQUIRED");
  }

  if (dedupedRecipientIds.length === 0) {
    return { count: 0 };
  }

  if (!type || !title || !message) {
    throw new ApiError(
      400,
      "Notification type, title, and message are required",
      "NOTIFICATION_FIELDS_REQUIRED",
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
  await enqueueNotification(notification);
};

export const createTicketEventNotificationService = async ({
  payload,
  type,
  title,
  message,
  recipientMode = "ticket-watchers",
}) => {
  const { organizationId, recipientIds } =
    await resolveRecipientsForTicketEvent({
      payload,
      recipientMode,
    });

  const filteredRecipientIds = await applyRecipientPreferences({
    recipientIds: dedupeRecipients(recipientIds),
    actorId: payload.actorId,
    type,
  });

  const notificationResult = await createInAppNotificationsService({
    organizationId,
    ticketId: payload.ticketId,
    recipientIds: filteredRecipientIds,
    type,
    title,
    message,
    metadata: payload.metadata ?? null,
  });

  await sendForTicketEventService({
    type,
    ticketId: payload.ticketId,
    organizationId,
    actorId: payload.actorId,
    recipientIds: filteredRecipientIds,
  });

  return notificationResult;
};

export const listMyNotificationsService = async (recipientId, options = {}) => {
  if (!recipientId) {
    throw new ApiError(400, "Recipient ID is required", "RECIPIENT_ID_REQUIRED");
  }

  return await getNotificationsByRecipient(recipientId, options);
};

export const markNotificationAsReadService = async (
  notificationId,
  recipientId,
) => {
  if (!notificationId || !recipientId) {
    throw new ApiError(400, "Notification ID and recipient ID are required", "NOTIFICATION_PARAMS_REQUIRED");
  }

  const result = await markNotificationAsRead(notificationId, recipientId);

  if (result.count === 0) {
    throw new ApiError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
  }

  return result;
};

export const markAllNotificationsAsReadService = async (recipientId) => {
  if (!recipientId) {
    throw new ApiError(400, "Recipient ID is required", "RECIPIENT_ID_REQUIRED");
  }

  return await markAllNotificationsAsRead(recipientId);
};

export const getMyNotificationPreferencesService = async (userId) => {
  if (!userId) {
    throw new ApiError(400, "User ID is required", "USER_ID_REQUIRED");
  }

  const preference = await getNotificationPreferenceByUserId(userId);

  if (!preference) {
    return {
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }

  return preference;
};

export const updateMyNotificationPreferencesService = async (
  userId,
  preferenceData,
) => {
  if (!userId) {
    throw new ApiError(400, "User ID is required", "USER_ID_REQUIRED");
  }

  return await upsertNotificationPreferenceByUserId(userId, preferenceData);
};
