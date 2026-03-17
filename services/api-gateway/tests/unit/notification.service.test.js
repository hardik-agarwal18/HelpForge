import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateNotifications = jest.fn();
const mockGetNotificationsByRecipient = jest.fn();
const mockMarkAllNotificationsAsRead = jest.fn();
const mockMarkNotificationAsRead = jest.fn();
const mockSendNotification = jest.fn();
const mockResolveRecipientsForTicketEvent = jest.fn();
const mockApplyRecipientPreferences = jest.fn();

jest.unstable_mockModule(
  "../../src/modules/notifications/notification.repo.js",
  () => ({
    createNotifications: mockCreateNotifications,
    getNotificationsByRecipient: mockGetNotificationsByRecipient,
    markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
    markNotificationAsRead: mockMarkNotificationAsRead,
  }),
);

jest.unstable_mockModule(
  "../../src/modules/notifications/notification.provider.js",
  () => ({
    sendNotification: mockSendNotification,
  }),
);

jest.unstable_mockModule(
  "../../src/modules/notifications/strategies/recipient.strategy.js",
  () => ({
    resolveRecipientsForTicketEvent: mockResolveRecipientsForTicketEvent,
  }),
);

jest.unstable_mockModule(
  "../../src/modules/notifications/strategies/preference.strategy.js",
  () => ({
    applyRecipientPreferences: mockApplyRecipientPreferences,
  }),
);

const {
  createInAppNotificationsService,
  createTicketEventNotificationService,
  listMyNotificationsService,
  markAllNotificationsAsReadService,
  markNotificationAsReadService,
  sendForTicketEventService,
} = await import("../../src/modules/notifications/notification.service.js");

describe("notification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNotifications.mockResolvedValue({ count: 1 });
    mockSendNotification.mockResolvedValue({ delivered: false });
    mockResolveRecipientsForTicketEvent.mockResolvedValue({
      organizationId: "org-1",
      recipientIds: ["user-1", "user-2", "user-1"],
    });
    mockApplyRecipientPreferences.mockResolvedValue(["user-1", "user-2"]);
    mockGetNotificationsByRecipient.mockResolvedValue([]);
    mockMarkNotificationAsRead.mockResolvedValue({ count: 1 });
    mockMarkAllNotificationsAsRead.mockResolvedValue({ count: 2 });
  });

  describe("createInAppNotificationsService", () => {
    it("dedupes recipients and persists notifications", async () => {
      const result = await createInAppNotificationsService({
        organizationId: "org-1",
        ticketId: "ticket-1",
        recipientIds: ["user-1", "user-2", "user-1", null],
        type: "TICKET_COMMENT_ADDED",
        title: "Comment added",
        message: "A comment was added.",
        metadata: { message: "hello" },
      });

      expect(mockCreateNotifications).toHaveBeenCalledWith([
        {
          organizationId: "org-1",
          ticketId: "ticket-1",
          recipientId: "user-1",
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
          metadata: { message: "hello" },
        },
        {
          organizationId: "org-1",
          ticketId: "ticket-1",
          recipientId: "user-2",
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
          metadata: { message: "hello" },
        },
      ]);
      expect(result).toEqual({ count: 1 });
    });

    it("returns count 0 when no recipients remain", async () => {
      const result = await createInAppNotificationsService({
        organizationId: "org-1",
        recipientIds: [],
        type: "TICKET_COMMENT_ADDED",
        title: "Comment added",
        message: "A comment was added.",
      });

      expect(mockCreateNotifications).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
    });

    it("throws when organizationId is missing", async () => {
      await expect(
        createInAppNotificationsService({
          recipientIds: ["user-1"],
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Organization ID is required",
      });
    });

    it("throws when required notification fields are missing", async () => {
      await expect(
        createInAppNotificationsService({
          organizationId: "org-1",
          recipientIds: ["user-1"],
          title: "Missing type",
          message: "Missing type should fail",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Notification type, title, and message are required",
      });
    });
  });

  describe("createTicketEventNotificationService", () => {
    it("uses strategy resolution and preference filtering before persistence", async () => {
      const payload = {
        ticketId: "ticket-1",
        organizationId: "org-1",
        actorId: "user-actor",
        metadata: {
          assignedToId: "user-2",
        },
      };

      await createTicketEventNotificationService({
        payload,
        type: "TICKET_ASSIGNED",
        title: "Ticket assigned",
        message: "A ticket has been assigned.",
        recipientMode: "assigned-agent",
      });

      expect(mockResolveRecipientsForTicketEvent).toHaveBeenCalledWith({
        payload,
        recipientMode: "assigned-agent",
      });
      expect(mockApplyRecipientPreferences).toHaveBeenCalledWith({
        recipientIds: ["user-1", "user-2"],
        actorId: "user-actor",
      });
      expect(mockCreateNotifications).toHaveBeenCalledWith([
        {
          organizationId: "org-1",
          ticketId: "ticket-1",
          recipientId: "user-1",
          type: "TICKET_ASSIGNED",
          title: "Ticket assigned",
          message: "A ticket has been assigned.",
          metadata: {
            assignedToId: "user-2",
          },
        },
        {
          organizationId: "org-1",
          ticketId: "ticket-1",
          recipientId: "user-2",
          type: "TICKET_ASSIGNED",
          title: "Ticket assigned",
          message: "A ticket has been assigned.",
          metadata: {
            assignedToId: "user-2",
          },
        },
      ]);
      expect(mockSendNotification).toHaveBeenCalledWith({
        type: "TICKET_ASSIGNED",
        ticketId: "ticket-1",
        organizationId: "org-1",
        actorId: "user-actor",
        recipientIds: ["user-1", "user-2"],
      });
    });

    it("returns 0 notifications when preference filtering removes everyone", async () => {
      const payload = {
        ticketId: "ticket-3",
        organizationId: "org-1",
        actorId: "user-actor",
      };

      mockApplyRecipientPreferences.mockResolvedValue([]);

      const result = await createTicketEventNotificationService({
        payload,
        type: "TICKET_TAG_ADDED",
        title: "Tag added",
        message: "A tag was added.",
      });

      expect(mockCreateNotifications).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
      expect(mockSendNotification).toHaveBeenCalledWith({
        type: "TICKET_TAG_ADDED",
        ticketId: "ticket-3",
        organizationId: "org-1",
        actorId: "user-actor",
        recipientIds: [],
      });
    });
  });

  describe("sendForTicketEventService", () => {
    it("forwards payload to provider", async () => {
      await sendForTicketEventService({ type: "TICKET_ASSIGNED" });

      expect(mockSendNotification).toHaveBeenCalledWith({
        type: "TICKET_ASSIGNED",
      });
    });
  });

  describe("listMyNotificationsService", () => {
    it("throws when recipientId is missing", async () => {
      await expect(listMyNotificationsService()).rejects.toMatchObject({
        statusCode: 400,
        message: "Recipient ID is required",
      });
    });

    it("returns notifications from repository", async () => {
      mockGetNotificationsByRecipient.mockResolvedValue([
        { id: "notification-1" },
      ]);

      const result = await listMyNotificationsService("user-1", {
        page: 2,
        pageSize: 10,
      });

      expect(mockGetNotificationsByRecipient).toHaveBeenCalledWith("user-1", {
        page: 2,
        pageSize: 10,
      });
      expect(result).toEqual([{ id: "notification-1" }]);
    });
  });

  describe("markNotificationAsReadService", () => {
    it("throws when required parameters are missing", async () => {
      await expect(markNotificationAsReadService("notification-1")).rejects.toMatchObject({
        statusCode: 400,
        message: "Notification ID and recipient ID are required",
      });
    });

    it("throws not found when no row is updated", async () => {
      mockMarkNotificationAsRead.mockResolvedValue({ count: 0 });

      await expect(
        markNotificationAsReadService("notification-1", "user-1"),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Notification not found",
      });
    });

    it("returns update result when row is updated", async () => {
      mockMarkNotificationAsRead.mockResolvedValue({ count: 1 });

      const result = await markNotificationAsReadService(
        "notification-1",
        "user-1",
      );

      expect(mockMarkNotificationAsRead).toHaveBeenCalledWith(
        "notification-1",
        "user-1",
      );
      expect(result).toEqual({ count: 1 });
    });
  });

  describe("markAllNotificationsAsReadService", () => {
    it("throws when recipientId is missing", async () => {
      await expect(markAllNotificationsAsReadService()).rejects.toMatchObject({
        statusCode: 400,
        message: "Recipient ID is required",
      });
    });

    it("returns repository update result", async () => {
      mockMarkAllNotificationsAsRead.mockResolvedValue({ count: 3 });

      const result = await markAllNotificationsAsReadService("user-1");

      expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({ count: 3 });
    });
  });
});
