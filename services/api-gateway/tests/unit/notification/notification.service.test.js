import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateNotifications = jest.fn();
const mockGetNotificationsByRecipient = jest.fn();
const mockGetNotificationPreferenceByUserId = jest.fn();
const mockMarkAllNotificationsAsRead = jest.fn();
const mockMarkNotificationAsRead = jest.fn();
const mockUpsertNotificationPreferenceByUserId = jest.fn();
const mockEnqueueNotification = jest.fn();
const mockResolveRecipientsForTicketEvent = jest.fn();
const mockApplyRecipientPreferences = jest.fn();

const basePayload = {
  ticketId: "ticket-1",
  organizationId: "org-1",
  actorId: "user-actor",
};

const buildPayload = (overrides = {}) => ({
  ...basePayload,
  ...overrides,
});

const expectApiError = async (promise, statusCode, message) => {
  await expect(promise).rejects.toMatchObject({ statusCode, message });
};

jest.unstable_mockModule(
  "../../../src/modules/notifications/notification.repo.js",
  () => ({
    createNotifications: mockCreateNotifications,
    getNotificationPreferenceByUserId: mockGetNotificationPreferenceByUserId,
    getNotificationsByRecipient: mockGetNotificationsByRecipient,
    markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
    markNotificationAsRead: mockMarkNotificationAsRead,
    upsertNotificationPreferenceByUserId:
      mockUpsertNotificationPreferenceByUserId,
  }),
);

jest.unstable_mockModule(
  "../../../src/modules/notifications/queue/notification.queue.js",
  () => ({
    enqueueNotification: mockEnqueueNotification,
  }),
);

jest.unstable_mockModule(
  "../../../src/modules/notifications/strategies/recipient.strategy.js",
  () => ({
    resolveRecipientsForTicketEvent: mockResolveRecipientsForTicketEvent,
  }),
);

jest.unstable_mockModule(
  "../../../src/modules/notifications/strategies/preference.strategy.js",
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
  getMyNotificationPreferencesService,
  updateMyNotificationPreferencesService,
} = await import("../../../src/modules/notifications/notification.service.js");

describe("notification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNotifications.mockResolvedValue({ count: 1 });
    mockEnqueueNotification.mockResolvedValue({ queued: true, jobId: "job-1" });
    mockResolveRecipientsForTicketEvent.mockResolvedValue({
      organizationId: "org-1",
      recipientIds: ["user-1", "user-2", "user-1"],
    });
    mockApplyRecipientPreferences.mockResolvedValue(["user-1", "user-2"]);
    mockGetNotificationsByRecipient.mockResolvedValue([]);
    mockGetNotificationPreferenceByUserId.mockResolvedValue(null);
    mockMarkNotificationAsRead.mockResolvedValue({ count: 1 });
    mockMarkAllNotificationsAsRead.mockResolvedValue({ count: 2 });
    mockUpsertNotificationPreferenceByUserId.mockResolvedValue({
      userId: "user-1",
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
      websocketEnabled: true,
      suppressSelfNotifications: true,
      disabledTypes: [],
    });
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

    it("handles undefined recipientIds as empty list", async () => {
      const result = await createInAppNotificationsService({
        organizationId: "org-1",
        type: "TICKET_COMMENT_ADDED",
        title: "Comment added",
        message: "A comment was added.",
      });

      expect(mockCreateNotifications).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
    });

    it("throws when organizationId is missing", async () => {
      await expectApiError(
        createInAppNotificationsService({
          recipientIds: ["user-1"],
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added.",
        }),
        400,
        "Organization ID is required",
      );
    });

    it("throws when required notification fields are missing", async () => {
      await expectApiError(
        createInAppNotificationsService({
          organizationId: "org-1",
          recipientIds: ["user-1"],
          title: "Missing type",
          message: "Missing type should fail",
        }),
        400,
        "Notification type, title, and message are required",
      );
    });
  });

  describe("createTicketEventNotificationService", () => {
    it("uses strategy resolution and preference filtering before persistence", async () => {
      const payload = buildPayload({
        metadata: {
          assignedToId: "user-2",
        },
      });

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
        type: "TICKET_ASSIGNED",
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
      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        type: "TICKET_ASSIGNED",
        ticketId: "ticket-1",
        organizationId: "org-1",
        actorId: "user-actor",
        recipientIds: ["user-1", "user-2"],
      });
    });

    it("returns 0 notifications when preference filtering removes everyone", async () => {
      const payload = buildPayload({ ticketId: "ticket-3" });

      mockApplyRecipientPreferences.mockResolvedValue([]);

      const result = await createTicketEventNotificationService({
        payload,
        type: "TICKET_TAG_ADDED",
        title: "Tag added",
        message: "A tag was added.",
      });

      expect(mockCreateNotifications).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 0 });
      expect(mockEnqueueNotification).toHaveBeenCalledWith({
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

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        type: "TICKET_ASSIGNED",
      });
    });
  });

  describe("notification preferences", () => {
    it("returns defaults when no preference row exists", async () => {
      mockGetNotificationPreferenceByUserId.mockResolvedValue(null);

      const result = await getMyNotificationPreferencesService("user-1");

      expect(result).toEqual({
        userId: "user-1",
        inAppEnabled: true,
        emailEnabled: false,
        pushEnabled: false,
        websocketEnabled: true,
        suppressSelfNotifications: true,
        disabledTypes: [],
      });
    });

    it("updates notification preferences", async () => {
      const result = await updateMyNotificationPreferencesService("user-1", {
        websocketEnabled: false,
      });

      expect(mockUpsertNotificationPreferenceByUserId).toHaveBeenCalledWith(
        "user-1",
        {
          websocketEnabled: false,
        },
      );
      expect(result).toEqual({
        userId: "user-1",
        inAppEnabled: true,
        emailEnabled: false,
        pushEnabled: false,
        websocketEnabled: true,
        suppressSelfNotifications: true,
        disabledTypes: [],
      });
    });
  });

  describe("listMyNotificationsService", () => {
    it("throws when recipientId is missing", async () => {
      await expectApiError(
        listMyNotificationsService(),
        400,
        "Recipient ID is required",
      );
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
      await expectApiError(
        markNotificationAsReadService("notification-1"),
        400,
        "Notification ID and recipient ID are required",
      );
    });

    it("throws not found when no row is updated", async () => {
      mockMarkNotificationAsRead.mockResolvedValue({ count: 0 });

      await expectApiError(
        markNotificationAsReadService("notification-1", "user-1"),
        404,
        "Notification not found",
      );
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
      await expectApiError(
        markAllNotificationsAsReadService(),
        400,
        "Recipient ID is required",
      );
    });

    it("returns repository update result", async () => {
      mockMarkAllNotificationsAsRead.mockResolvedValue({ count: 3 });

      const result = await markAllNotificationsAsReadService("user-1");

      expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({ count: 3 });
    });
  });
});
