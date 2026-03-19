import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockQueueAdd = jest.fn();
const mockQueueConstructor = jest.fn();
const mockGetSharedBullmqConnection = jest.fn();
const mockLoggerWarn = jest.fn();

jest.unstable_mockModule("bullmq", () => ({
  Queue: mockQueueConstructor,
}));

jest.unstable_mockModule(
  "../../../../src/config/redis.config.js",
  () => ({
    getSharedBullmqConnection: mockGetSharedBullmqConnection,
  }),
);

jest.unstable_mockModule("../../../../src/config/logger.js", () => ({
  default: {
    warn: mockLoggerWarn,
  },
}));

const queueModule = await import(
  "../../../../src/modules/ai/automation/queue/ai.automation.queue.js"
);

describe("ai.automation.queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueConstructor.mockImplementation(() => ({
      add: mockQueueAdd,
    }));
  });

  it("enqueues AI comment processing jobs when Redis is available", async () => {
    mockGetSharedBullmqConnection.mockReturnValue({ redis: true });
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await queueModule.enqueueAICommentProcessing({
      ticketId: "ticket-1",
      commentId: "comment-1",
    });

    expect(mockQueueConstructor).toHaveBeenCalledWith("ai-automation", {
      connection: { redis: true },
      defaultJobOptions: expect.objectContaining({
        attempts: 3,
      }),
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-ticket-comment",
      {
        ticketId: "ticket-1",
        commentId: "comment-1",
      },
      {
        jobId: "ticket-1:comment-1",
      },
    );
    expect(result).toEqual({
      queued: true,
      jobId: "job-1",
    });
  });

  it("returns queued false when Redis is unavailable", async () => {
    mockGetSharedBullmqConnection.mockReturnValue(null);

    const payload = {
      ticketId: "ticket-2",
      commentId: "comment-2",
    };

    const result = await queueModule.enqueueAICommentProcessing(payload);

    expect(mockQueueConstructor).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "AI automation queue disabled because REDIS_URL is not set",
    );
    expect(result).toEqual({
      queued: false,
      payload,
    });
  });
});
