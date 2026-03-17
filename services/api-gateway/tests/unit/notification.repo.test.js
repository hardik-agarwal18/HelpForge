import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockNotificationCreateMany = jest.fn();
const mockNotificationFindMany = jest.fn();
const mockNotificationUpdateMany = jest.fn();
const mockTicketFindUnique = jest.fn();
const mockMembershipFindMany = jest.fn();

jest.unstable_mockModule("../../src/config/database.config.js", () => ({
  default: {
    notification: {
      createMany: mockNotificationCreateMany,
      findMany: mockNotificationFindMany,
      updateMany: mockNotificationUpdateMany,
    },
    ticket: {
      findUnique: mockTicketFindUnique,
    },
    membership: {
      findMany: mockMembershipFindMany,
    },
  },
}));

const {
  createNotifications,
  getNotificationsByRecipient,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  getTicketNotificationContext,
  getOrganizationStaffRecipientIds,
} = await import("../../src/modules/notifications/notification.repo.js");

describe("notification.repo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNotifications", () => {
    it("returns count 0 when input is not an array", async () => {
      const result = await createNotifications(null);

      expect(result).toEqual({ count: 0 });
      expect(mockNotificationCreateMany).not.toHaveBeenCalled();
    });

    it("returns count 0 when input array is empty", async () => {
      const result = await createNotifications([]);

      expect(result).toEqual({ count: 0 });
      expect(mockNotificationCreateMany).not.toHaveBeenCalled();
    });

    it("persists notifications with createMany", async () => {
      mockNotificationCreateMany.mockResolvedValue({ count: 2 });

      const rows = [
        { recipientId: "user-1", type: "TICKET_ASSIGNED" },
        { recipientId: "user-2", type: "TICKET_ASSIGNED" },
      ];

      const result = await createNotifications(rows);

      expect(mockNotificationCreateMany).toHaveBeenCalledWith({ data: rows });
      expect(result).toEqual({ count: 2 });
    });
  });

  describe("getNotificationsByRecipient", () => {
    it("uses defaults when options are omitted", async () => {
      mockNotificationFindMany.mockResolvedValue([
        { id: "notification-default" },
      ]);

      const result = await getNotificationsByRecipient("user-default");

      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: {
          recipientId: "user-default",
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual([{ id: "notification-default" }]);
    });

    it("uses defaults and excludes isRead filter when not boolean", async () => {
      mockNotificationFindMany.mockResolvedValue([{ id: "notification-1" }]);

      const result = await getNotificationsByRecipient("user-1", {
        page: 0,
        pageSize: -5,
      });

      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: {
          recipientId: "user-1",
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual([{ id: "notification-1" }]);
    });

    it("applies pagination and isRead filter", async () => {
      mockNotificationFindMany.mockResolvedValue([{ id: "notification-2" }]);

      await getNotificationsByRecipient("user-2", {
        page: 3,
        pageSize: 5,
        isRead: true,
      });

      expect(mockNotificationFindMany).toHaveBeenCalledWith({
        where: {
          recipientId: "user-2",
          isRead: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: 10,
        take: 5,
      });
    });
  });

  describe("mark read mutations", () => {
    it("marks one notification as read", async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 1 });

      const result = await markNotificationAsRead("notification-1", "user-1");

      expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "notification-1",
          recipientId: "user-1",
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ count: 1 });
    });

    it("marks all notifications as read for recipient", async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 4 });

      const result = await markAllNotificationsAsRead("user-2");

      expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
        where: {
          recipientId: "user-2",
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ count: 4 });
    });
  });

  describe("ticket and staff recipient context", () => {
    it("returns null when ticketId is missing", async () => {
      const result = await getTicketNotificationContext();

      expect(result).toBeNull();
      expect(mockTicketFindUnique).not.toHaveBeenCalled();
    });

    it("loads ticket notification context by id", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: "user-2",
      });

      const result = await getTicketNotificationContext("ticket-1");

      expect(mockTicketFindUnique).toHaveBeenCalledWith({
        where: {
          id: "ticket-1",
        },
        select: {
          id: true,
          organizationId: true,
          createdById: true,
          assignedToId: true,
        },
      });
      expect(result).toEqual({
        id: "ticket-1",
        organizationId: "org-1",
        createdById: "user-1",
        assignedToId: "user-2",
      });
    });

    it("returns empty recipients when organizationId is missing", async () => {
      const result = await getOrganizationStaffRecipientIds();

      expect(result).toEqual([]);
      expect(mockMembershipFindMany).not.toHaveBeenCalled();
    });

    it("maps organization staff memberships to recipient ids", async () => {
      mockMembershipFindMany.mockResolvedValue([
        { userId: "owner-1" },
        { userId: "admin-1" },
        { userId: "agent-1" },
      ]);

      const result = await getOrganizationStaffRecipientIds("org-1");

      expect(mockMembershipFindMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          role: {
            in: ["OWNER", "ADMIN", "AGENT"],
          },
        },
        select: {
          userId: true,
        },
      });
      expect(result).toEqual(["owner-1", "admin-1", "agent-1"]);
    });
  });
});
