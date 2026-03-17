import prisma from "../../config/database.config.js";

const STAFF_ROLES = ["OWNER", "ADMIN", "AGENT"];

export const createNotifications = async (notifications) => {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return { count: 0 };
  }

  return await prisma.notification.createMany({
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

  return await prisma.notification.findMany({
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
  return await prisma.notification.updateMany({
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
  return await prisma.notification.updateMany({
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

  return await prisma.ticket.findUnique({
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

  const memberships = await prisma.membership.findMany({
    where: {
      organizationId,
      role: {
        in: STAFF_ROLES,
      },
    },
    select: {
      userId: true,
    },
  });

  return memberships.map((membership) => membership.userId);
};
