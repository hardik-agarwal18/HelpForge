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
});
