import db from "../../config/database.config.js";

import { PERMISSIONS } from "../organization/org.constants.js";

export const createNotifications = async (notifications) => {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return { count: 0 };
  }

  return await db.write.notification.createMany({
    data: notifications,
  });
};

export const getNotificationsByRecipient = async (
  recipientId,
  { page = 1, pageSize = 20, isRead } = {},
) => {
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const normalizedPageSize = Number(pageSize) > 0 ? Number(pageSize) : 20;
  const skip = (normalizedPage - 1) * normalizedPageSize;

  return await db.read.notification.findMany({
    where: {
      recipientId,
      ...(typeof isRead === "boolean" ? { isRead } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: normalizedPageSize,
  });
};

export const markNotificationAsRead = async (notificationId, recipientId) => {
  return await db.write.notification.updateMany({
    where: {
      id: notificationId,
      recipientId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

export const markAllNotificationsAsRead = async (recipientId) => {
  return await db.write.notification.updateMany({
    where: {
      recipientId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

export const getTicketNotificationContext = async (ticketId) => {
  if (!ticketId) {
    return null;
  }

  return await db.read.ticket.findUnique({
    where: {
      id: ticketId,
    },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      assignedToId: true,
    },
  });
};

export const getOrganizationStaffRecipientIds = async (organizationId) => {
  if (!organizationId) {
    return [];
  }

  const memberships = await db.read.membership.findMany({
    where: {
      organizationId,
      role: {
        permissions: {
          has: PERMISSIONS.TICKET_VIEW_ALL,
        },
      },
    },
    select: {
      userId: true,
    },
  });

  return memberships.map((membership) => membership.userId);
};

export const getNotificationPreferencesForUsers = async (userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  return await db.read.notificationPreference.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    select: {
      userId: true,
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      websocketEnabled: true,
      suppressSelfNotifications: true,
      disabledTypes: true,
    },
  });
};

export const getNotificationPreferenceByUserId = async (userId) => {
  if (!userId) {
    return null;
  }

  return await db.read.notificationPreference.findUnique({
    where: {
      userId,
    },
  });
};

export const upsertNotificationPreferenceByUserId = async (userId, data) => {
  return await db.write.notificationPreference.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      ...data,
    },
    update: data,
  });
};
