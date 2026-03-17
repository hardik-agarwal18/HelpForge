import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateNotifications = jest.fn();
const mockGetNotificationsByRecipient = jest.fn();
const mockMarkAllNotificationsAsRead = jest.fn();
const mockMarkNotificationAsRead = jest.fn();
const mockGetTicketNotificationContext = jest.fn();
const mockGetOrganizationStaffRecipientIds = jest.fn();
const mockSendNotification = jest.fn();

jest.unstable_mockModule(
  "../../src/modules/notifications/notification.repo.js",
  () => ({
    createNotifications: mockCreateNotifications,
    getNotificationsByRecipient: mockGetNotificationsByRecipient,
    markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
    markNotificationAsRead: mockMarkNotificationAsRead,
    getTicketNotificationContext: mockGetTicketNotificationContext,
    getOrganizationStaffRecipientIds: mockGetOrganizationStaffRecipientIds,
  }),
);

jest.unstable_mockModule(
  "../../src/modules/notifications/notification.provider.js",
  () => ({
    sendNotification: mockSendNotification,
  }),
);

const {
  createInAppNotificationsService,
  createTicketEventNotificationService,
} = await import("../../src/modules/notifications/notification.service.js");

describe("notification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNotifications.mockResolvedValue({ count: 1 });
    mockSendNotification.mockResolvedValue({ delivered: false });
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
  });

  describe("createTicketEventNotificationService", () => {
    it("notifies assigned agent only for assigned-agent mode", async () => {
      const payload = {
        ticketId: "ticket-1",
        organizationId: "org-1",
        actorId: "user-actor",
        metadata: {
          assignedToId: "user-agent",
        },
      };

      await createTicketEventNotificationService({
        payload,
        type: "TICKET_ASSIGNED",
        title: "Ticket assigned",
        message: "A ticket has been assigned.",
        recipientMode: "assigned-agent",
      });

      expect(mockCreateNotifications).toHaveBeenCalledWith([
        {
          organizationId: "org-1",
          ticketId: "ticket-1",
          recipientId: "user-agent",
          type: "TICKET_ASSIGNED",
          title: "Ticket assigned",
          message: "A ticket has been assigned.",
          metadata: {
            assignedToId: "user-agent",
          },
        },
      ]);
      expect(mockGetTicketNotificationContext).not.toHaveBeenCalled();
    });

    it("builds watcher recipients, excludes actor, and dedupes", async () => {
      const payload = {
        ticketId: "ticket-2",
        organizationId: "org-1",
        actorId: "user-actor",
        metadata: {
          message: "hello",
        },
      };

      mockGetTicketNotificationContext.mockResolvedValue({
        id: "ticket-2",
        organizationId: "org-1",
        createdById: "user-creator",
        assignedToId: "user-assignee",
      });
      mockGetOrganizationStaffRecipientIds.mockResolvedValue([
        "user-assignee",
        "user-staff",
        "user-actor",
      ]);

      await createTicketEventNotificationService({
        payload,
        type: "TICKET_COMMENT_ADDED",
        title: "Comment added",
        message: "A comment was added.",
      });

      expect(mockCreateNotifications).toHaveBeenCalledWith([
        {
          organizationId: "org-1",
          ticketId: "ticket-2",
          recipientId: "user-creator",
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
          metadata: {
            message: "hello",
          },
        },
        {
          organizationId: "org-1",
          ticketId: "ticket-2",
          recipientId: "user-assignee",
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
          metadata: {
            message: "hello",
          },
        },
        {
          organizationId: "org-1",
          ticketId: "ticket-2",
          recipientId: "user-staff",
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
          metadata: {
            message: "hello",
          },
        },
      ]);
    });

    it("returns 0 notifications when ticket context is missing", async () => {
      mockGetTicketNotificationContext.mockResolvedValue(null);

      const result = await createTicketEventNotificationService({
        payload: {
          ticketId: "missing-ticket",
          organizationId: "org-1",
          actorId: "user-actor",
        },
        type: "TICKET_TAG_ADDED",
        title: "Tag added",
        message: "A tag was added.",
      });

      expect(mockCreateNotifications).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
    });
  });
});
