import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockHandleCommentAdded = jest.fn();
const mockEnqueueAICommentProcessing = jest.fn();
const mockRegisterAsyncHandler = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.unstable_mockModule(
  "../../../../src/modules/ai/automation/ai.automation.service.js",
  () => ({
    handleCommentAdded: mockHandleCommentAdded,
  }),
);

jest.unstable_mockModule(
  "../../../../src/modules/ai/automation/queue/ai.automation.queue.js",
  () => ({
    enqueueAICommentProcessing: mockEnqueueAICommentProcessing,
  }),
);

jest.unstable_mockModule("../../../../src/events/eventBus.js", () => ({
  registerAsyncHandler: mockRegisterAsyncHandler,
}));

jest.unstable_mockModule("../../../../src/config/logger.js", () => ({
  default: {
    debug: mockLoggerDebug,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

const handlers = await import(
  "../../../../src/modules/ai/automation/ai.automation.handlers.js"
);

describe("ai.automation.handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queues AI automation work when the queue is available", async () => {
    const payload = {
      ticketId: "ticket-1",
      commentId: "comment-1",
    };
    mockEnqueueAICommentProcessing.mockResolvedValue({
      queued: true,
      jobId: "job-1",
    });

    await handlers.handleTicketCommentAdded(payload);

    expect(mockEnqueueAICommentProcessing).toHaveBeenCalledWith(payload);
    expect(mockHandleCommentAdded).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      { payload, jobId: "job-1" },
      "AI Handler: Queued comment for AI processing",
    );
  });

  it("falls back to inline processing when the queue is unavailable", async () => {
    const payload = {
      ticketId: "ticket-2",
      commentId: "comment-2",
    };
    mockEnqueueAICommentProcessing.mockResolvedValue({
      queued: false,
      payload,
    });

    await handlers.handleTicketCommentAdded(payload);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { payload },
      "AI Handler: Queue unavailable, processing comment inline",
    );
    expect(mockHandleCommentAdded).toHaveBeenCalledWith(payload);
  });
});
