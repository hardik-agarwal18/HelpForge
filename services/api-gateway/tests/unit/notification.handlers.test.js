import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLoggerInfo = jest.fn();
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

await import("../../src/events/handlers/notification.handlers.js");

describe("notification.handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it("logs notification payloads when metadata is present", async () => {
    const scenarios = [
      {
        eventName: "ticket.assigned",
        payload: {
          ticketId: "ticket-1",
          organizationId: "org-1",
          actorId: "user-1",
          metadata: { assignedToId: "agent-1" },
        },
        message: "Notification should be sent to the assigned agent",
        expectedContext: {
          ticketId: "ticket-1",
          organizationId: "org-1",
          actorId: "user-1",
          assignedToId: "agent-1",
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
        message: "Notification should be sent for ticket comment added",
        expectedContext: {
          ticketId: "ticket-2",
          organizationId: "org-1",
          actorId: "user-2",
          message: "hello",
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
        message: "Notification should be sent for ticket comment deleted",
        expectedContext: {
          ticketId: "ticket-3",
          organizationId: "org-1",
          actorId: "user-3",
          message: "bye",
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
        message: "Notification should be sent for ticket tag added",
        expectedContext: {
          ticketId: "ticket-4",
          organizationId: "org-1",
          actorId: "user-4",
          tagName: "Bug",
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
        message: "Notification should be sent for ticket tag removed",
        expectedContext: {
          ticketId: "ticket-5",
          organizationId: "org-1",
          actorId: "user-5",
          tagName: "Bug",
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
        message: "Notification should be sent for ticket attachment added",
        expectedContext: {
          ticketId: "ticket-6",
          organizationId: "org-1",
          actorId: "user-6",
          fileUrl: "https://example.com/a.pdf",
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
        message: "Notification should be sent for ticket attachment deleted",
        expectedContext: {
          ticketId: "ticket-7",
          organizationId: "org-1",
          actorId: "user-7",
          fileUrl: "https://example.com/a.pdf",
        },
      },
    ];

    for (const scenario of scenarios) {
      const handler = registeredHandlers.get(scenario.eventName);

      await handler(scenario.payload);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        scenario.expectedContext,
        scenario.message,
      );
    }
  });

  it("falls back to null when metadata fields are missing", async () => {
    const scenarios = [
      {
        eventName: "ticket.assigned",
        payload: {
          ticketId: "ticket-11",
          organizationId: "org-1",
          actorId: "user-1",
        },
        message: "Notification should be sent to the assigned agent",
        expectedContext: {
          ticketId: "ticket-11",
          organizationId: "org-1",
          actorId: "user-1",
          assignedToId: null,
        },
      },
      {
        eventName: "ticket.comment.added",
        payload: {
          ticketId: "ticket-12",
          organizationId: "org-1",
          actorId: "user-2",
        },
        message: "Notification should be sent for ticket comment added",
        expectedContext: {
          ticketId: "ticket-12",
          organizationId: "org-1",
          actorId: "user-2",
          message: null,
        },
      },
      {
        eventName: "ticket.comment.deleted",
        payload: {
          ticketId: "ticket-13",
          organizationId: "org-1",
          actorId: "user-3",
        },
        message: "Notification should be sent for ticket comment deleted",
        expectedContext: {
          ticketId: "ticket-13",
          organizationId: "org-1",
          actorId: "user-3",
          message: null,
        },
      },
      {
        eventName: "ticket.tag.added",
        payload: {
          ticketId: "ticket-14",
          organizationId: "org-1",
          actorId: "user-4",
        },
        message: "Notification should be sent for ticket tag added",
        expectedContext: {
          ticketId: "ticket-14",
          organizationId: "org-1",
          actorId: "user-4",
          tagName: null,
        },
      },
      {
        eventName: "ticket.tag.removed",
        payload: {
          ticketId: "ticket-15",
          organizationId: "org-1",
          actorId: "user-5",
        },
        message: "Notification should be sent for ticket tag removed",
        expectedContext: {
          ticketId: "ticket-15",
          organizationId: "org-1",
          actorId: "user-5",
          tagName: null,
        },
      },
      {
        eventName: "ticket.attachment.added",
        payload: {
          ticketId: "ticket-16",
          organizationId: "org-1",
          actorId: "user-6",
        },
        message: "Notification should be sent for ticket attachment added",
        expectedContext: {
          ticketId: "ticket-16",
          organizationId: "org-1",
          actorId: "user-6",
          fileUrl: null,
        },
      },
      {
        eventName: "ticket.attachment.deleted",
        payload: {
          ticketId: "ticket-17",
          organizationId: "org-1",
          actorId: "user-7",
        },
        message: "Notification should be sent for ticket attachment deleted",
        expectedContext: {
          ticketId: "ticket-17",
          organizationId: "org-1",
          actorId: "user-7",
          fileUrl: null,
        },
      },
    ];

    for (const scenario of scenarios) {
      const handler = registeredHandlers.get(scenario.eventName);

      await handler(scenario.payload);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        scenario.expectedContext,
        scenario.message,
      );
    }
  });
});
