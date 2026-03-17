import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLoggerInfo = jest.fn();
const mockCreateTicketEventNotificationService = jest.fn();
const registeredHandlers = new Map();

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  default: {
    info: mockLoggerInfo,
  },
}));

jest.unstable_mockModule("../../src/events/eventBus.js", () => ({
  registerAsyncHandler: (eventName, handler) => {
    registeredHandlers.set(eventName, handler);
  },
}));

jest.unstable_mockModule(
  "../../src/modules/notifications/notification.service.js",
  () => ({
    createTicketEventNotificationService:
      mockCreateTicketEventNotificationService,
  }),
);

await import("../../src/events/handlers/notification.handlers.js");

describe("notification.handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTicketEventNotificationService.mockResolvedValue({ count: 2 });
  });

  it("registers handlers for all notification-worthy ticket events", () => {
    expect(registeredHandlers.has("ticket.assigned")).toBe(true);
    expect(registeredHandlers.has("ticket.comment.added")).toBe(true);
    expect(registeredHandlers.has("ticket.comment.deleted")).toBe(true);
    expect(registeredHandlers.has("ticket.tag.added")).toBe(true);
    expect(registeredHandlers.has("ticket.tag.removed")).toBe(true);
    expect(registeredHandlers.has("ticket.attachment.added")).toBe(true);
    expect(registeredHandlers.has("ticket.attachment.deleted")).toBe(true);
  });

  it("dispatches notification events with expected config", async () => {
    const scenarios = [
      {
        eventName: "ticket.assigned",
        payload: {
          ticketId: "ticket-1",
          organizationId: "org-1",
          actorId: "user-1",
          metadata: { assignedToId: "agent-1" },
        },
        expectedConfig: {
          type: "TICKET_ASSIGNED",
          title: "Ticket assigned",
          message: "A ticket has been assigned.",
          recipientMode: "assigned-agent",
        },
      },
      {
        eventName: "ticket.comment.added",
        payload: {
          ticketId: "ticket-2",
          organizationId: "org-1",
          actorId: "user-2",
          metadata: { message: "hello" },
        },
        expectedConfig: {
          type: "TICKET_COMMENT_ADDED",
          title: "Comment added",
          message: "A comment was added to the ticket.",
        },
      },
      {
        eventName: "ticket.comment.deleted",
        payload: {
          ticketId: "ticket-3",
          organizationId: "org-1",
          actorId: "user-3",
          metadata: { message: "bye" },
        },
        expectedConfig: {
          type: "TICKET_COMMENT_DELETED",
          title: "Comment deleted",
          message: "A comment was deleted from the ticket.",
        },
      },
      {
        eventName: "ticket.tag.added",
        payload: {
          ticketId: "ticket-4",
          organizationId: "org-1",
          actorId: "user-4",
          metadata: { tagName: "Bug" },
        },
        expectedConfig: {
          type: "TICKET_TAG_ADDED",
          title: "Tag added",
          message: "A tag was added to the ticket.",
        },
      },
      {
        eventName: "ticket.tag.removed",
        payload: {
          ticketId: "ticket-5",
          organizationId: "org-1",
          actorId: "user-5",
          metadata: { tagName: "Bug" },
        },
        expectedConfig: {
          type: "TICKET_TAG_REMOVED",
          title: "Tag removed",
          message: "A tag was removed from the ticket.",
        },
      },
      {
        eventName: "ticket.attachment.added",
        payload: {
          ticketId: "ticket-6",
          organizationId: "org-1",
          actorId: "user-6",
          metadata: { fileUrl: "https://example.com/a.pdf" },
        },
        expectedConfig: {
          type: "TICKET_ATTACHMENT_ADDED",
          title: "Attachment added",
          message: "An attachment was added to the ticket.",
        },
      },
      {
        eventName: "ticket.attachment.deleted",
        payload: {
          ticketId: "ticket-7",
          organizationId: "org-1",
          actorId: "user-7",
          metadata: { fileUrl: "https://example.com/a.pdf" },
        },
        expectedConfig: {
          type: "TICKET_ATTACHMENT_DELETED",
          title: "Attachment deleted",
          message: "An attachment was removed from the ticket.",
        },
      },
    ];

    for (const scenario of scenarios) {
      const handler = registeredHandlers.get(scenario.eventName);

      await handler(scenario.payload);

      expect(mockCreateTicketEventNotificationService).toHaveBeenCalledWith({
        payload: scenario.payload,
        ...scenario.expectedConfig,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        {
          eventName: scenario.eventName,
          ticketId: scenario.payload.ticketId,
          organizationId: scenario.payload.organizationId,
          actorId: scenario.payload.actorId,
          notificationCount: 2,
        },
        "Ticket notifications processed",
      );
    }
  });

  it("continues to process events when metadata is missing", async () => {
    const handler = registeredHandlers.get("ticket.comment.added");

    await handler({
      ticketId: "ticket-20",
      organizationId: "org-1",
      actorId: "user-9",
    });

    expect(mockCreateTicketEventNotificationService).toHaveBeenCalledWith({
      payload: {
        ticketId: "ticket-20",
        organizationId: "org-1",
        actorId: "user-9",
      },
      type: "TICKET_COMMENT_ADDED",
      title: "Comment added",
      message: "A comment was added to the ticket.",
    });
  });
});
