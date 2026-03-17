import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateTicketActivityLog = jest.fn();
const mockLoggerDebug = jest.fn();
const registeredHandlers = new Map();

jest.unstable_mockModule("../../src/modules/tickets/ticket.repo.js", () => ({
  createTicketActivityLog: mockCreateTicketActivityLog,
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  default: {
    debug: mockLoggerDebug,
  },
}));

jest.unstable_mockModule("../../src/events/eventBus.js", () => ({
  registerAsyncHandler: (eventName, handler) => {
    registeredHandlers.set(eventName, handler);
  },
}));

await import("../../src/events/handlers/ticket.handlers.js");

describe("ticket.handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registers handlers for all ticket activity events", () => {
    expect(registeredHandlers.has("ticket.created")).toBe(true);
    expect(registeredHandlers.has("ticket.assigned")).toBe(true);
    expect(registeredHandlers.has("ticket.status.changed")).toBe(true);
    expect(registeredHandlers.has("ticket.comment.added")).toBe(true);
    expect(registeredHandlers.has("ticket.comment.deleted")).toBe(true);
    expect(registeredHandlers.has("ticket.tag.added")).toBe(true);
    expect(registeredHandlers.has("ticket.tag.removed")).toBe(true);
    expect(registeredHandlers.has("ticket.attachment.added")).toBe(true);
    expect(registeredHandlers.has("ticket.attachment.deleted")).toBe(true);
  });

  it("logs activity for comment add event", async () => {
    const handler = registeredHandlers.get("ticket.comment.added");

    await handler({
      ticketId: "ticket-1",
      organizationId: "org-1",
      actorId: "user-1",
      metadata: {
        message: "hello",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-1", {
      actorId: "user-1",
      action: "COMMENT_ADDED",
      newValue: "hello",
    });
  });

  it("logs activity for comment delete event", async () => {
    const handler = registeredHandlers.get("ticket.comment.deleted");

    await handler({
      ticketId: "ticket-1",
      organizationId: "org-1",
      actorId: "user-2",
      metadata: {
        message: "remove me",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-1", {
      actorId: "user-2",
      action: "COMMENT_DELETED",
      oldValue: "remove me",
    });
  });

  it("logs activity for tag add event", async () => {
    const handler = registeredHandlers.get("ticket.tag.added");

    await handler({
      ticketId: "ticket-2",
      organizationId: "org-1",
      actorId: "user-1",
      metadata: {
        tagName: "Bug",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-2", {
      actorId: "user-1",
      action: "TAG_ADDED",
      newValue: "Bug",
    });
  });

  it("logs activity for tag remove event", async () => {
    const handler = registeredHandlers.get("ticket.tag.removed");

    await handler({
      ticketId: "ticket-2",
      organizationId: "org-1",
      actorId: "user-3",
      metadata: {
        tagName: "Bug",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-2", {
      actorId: "user-3",
      action: "TAG_REMOVED",
      oldValue: "Bug",
    });
  });

  it("logs activity for attachment add event", async () => {
    const handler = registeredHandlers.get("ticket.attachment.added");

    await handler({
      ticketId: "ticket-3",
      organizationId: "org-1",
      actorId: "user-1",
      metadata: {
        fileUrl: "https://example.com/file.pdf",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-3", {
      actorId: "user-1",
      action: "ATTACHMENT_ADDED",
      newValue: "https://example.com/file.pdf",
    });
  });

  it("logs activity for attachment delete event", async () => {
    const handler = registeredHandlers.get("ticket.attachment.deleted");

    await handler({
      ticketId: "ticket-3",
      organizationId: "org-1",
      actorId: "user-2",
      metadata: {
        fileUrl: "https://example.com/file.pdf",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-3", {
      actorId: "user-2",
      action: "ATTACHMENT_DELETED",
      oldValue: "https://example.com/file.pdf",
    });
  });

  it("logs activity for created, assigned, and status events", async () => {
    const createdHandler = registeredHandlers.get("ticket.created");
    const assignedHandler = registeredHandlers.get("ticket.assigned");
    const statusHandler = registeredHandlers.get("ticket.status.changed");

    await createdHandler({
      ticketId: "ticket-10",
      organizationId: "org-1",
      actorId: "user-1",
      metadata: {
        title: "Login issue",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-10", {
      actorId: "user-1",
      action: "TICKET_CREATED",
      newValue: "Login issue",
    });

    await assignedHandler({
      ticketId: "ticket-11",
      organizationId: "org-1",
      actorId: "user-2",
      metadata: {
        previousAssignedToId: "agent-1",
        assignedToId: "agent-2",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-11", {
      actorId: "user-2",
      action: "TICKET_ASSIGNED",
      oldValue: "agent-1",
      newValue: "agent-2",
    });

    await statusHandler({
      ticketId: "ticket-12",
      organizationId: "org-1",
      actorId: "user-3",
      metadata: {
        previousStatus: "OPEN",
        status: "RESOLVED",
      },
    });

    expect(mockCreateTicketActivityLog).toHaveBeenCalledWith("ticket-12", {
      actorId: "user-3",
      action: "TICKET_STATUS_UPDATED",
      oldValue: "OPEN",
      newValue: "RESOLVED",
    });
  });

  it("falls back to null when metadata fields are missing", async () => {
    const scenarios = [
      {
        eventName: "ticket.created",
        ticketId: "ticket-20",
        actorId: "user-1",
        expected: {
          action: "TICKET_CREATED",
          newValue: null,
        },
      },
      {
        eventName: "ticket.assigned",
        ticketId: "ticket-21",
        actorId: "user-2",
        expected: {
          action: "TICKET_ASSIGNED",
          oldValue: null,
          newValue: null,
        },
      },
      {
        eventName: "ticket.status.changed",
        ticketId: "ticket-22",
        actorId: "user-3",
        expected: {
          action: "TICKET_STATUS_UPDATED",
          oldValue: null,
          newValue: null,
        },
      },
      {
        eventName: "ticket.comment.added",
        ticketId: "ticket-23",
        actorId: "user-4",
        expected: {
          action: "COMMENT_ADDED",
          newValue: null,
        },
      },
      {
        eventName: "ticket.comment.deleted",
        ticketId: "ticket-24",
        actorId: "user-5",
        expected: {
          action: "COMMENT_DELETED",
          oldValue: null,
        },
      },
      {
        eventName: "ticket.tag.added",
        ticketId: "ticket-25",
        actorId: "user-6",
        expected: {
          action: "TAG_ADDED",
          newValue: null,
        },
      },
      {
        eventName: "ticket.tag.removed",
        ticketId: "ticket-26",
        actorId: "user-7",
        expected: {
          action: "TAG_REMOVED",
          oldValue: null,
        },
      },
      {
        eventName: "ticket.attachment.added",
        ticketId: "ticket-27",
        actorId: "user-8",
        expected: {
          action: "ATTACHMENT_ADDED",
          newValue: null,
        },
      },
      {
        eventName: "ticket.attachment.deleted",
        ticketId: "ticket-28",
        actorId: "user-9",
        expected: {
          action: "ATTACHMENT_DELETED",
          oldValue: null,
        },
      },
    ];

    for (const scenario of scenarios) {
      const handler = registeredHandlers.get(scenario.eventName);

      await handler({
        ticketId: scenario.ticketId,
        organizationId: "org-1",
        actorId: scenario.actorId,
      });

      expect(mockCreateTicketActivityLog).toHaveBeenCalledWith(
        scenario.ticketId,
        {
          actorId: scenario.actorId,
          ...scenario.expected,
        },
      );
    }
  });
});
