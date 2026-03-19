import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWorkerOn = jest.fn();
const mockWorkerConstructor = jest.fn();
const mockQueueConstructor = jest.fn();
const mockCreateRedisClient = jest.fn();
const mockGetSharedBullmqConnection = jest.fn();
const mockHandleCommentAdded = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

jest.unstable_mockModule("bullmq", () => ({
  Queue: mockQueueConstructor,
  Worker: mockWorkerConstructor,
}));

jest.unstable_mockModule("../../../../src/config/index.js", () => ({
  default: {
    redis: { url: "redis://localhost:6379" },
    nodeEnv: "development",
  },
}));

jest.unstable_mockModule(
  "../../../../src/config/redis.config.js",
  () => ({
    createRedisClient: mockCreateRedisClient,
    getSharedBullmqConnection: mockGetSharedBullmqConnection,
  }),
);

jest.unstable_mockModule(
  "../../../../src/modules/ai/automation/ai.automation.service.js",
  () => ({
    handleCommentAdded: mockHandleCommentAdded,
  }),
);

jest.unstable_mockModule("../../../../src/config/logger.js", () => ({
  default: {
    info: mockLoggerInfo,
    debug: mockLoggerDebug,
    error: mockLoggerError,
  },
}));

const workerModule = await import(
  "../../../../src/modules/ai/automation/queue/ai.automation.worker.js"
);

describe("ai.automation.worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerConstructor.mockImplementation(() => ({
      on: mockWorkerOn,
    }));
    mockQueueConstructor.mockImplementation(() => ({}));
  });

  it("processes AI comment jobs via the automation service", async () => {
    const job = {
      id: "job-1",
      data: {
        ticketId: "ticket-1",
        commentId: "comment-1",
      },
    };

    const result = await workerModule.processAICommentJob(job);

    expect(mockHandleCommentAdded).toHaveBeenCalledWith(job.data);
    expect(result).toEqual({
      processed: true,
      jobId: "job-1",
    });
  });

  it("starts a BullMQ worker when Redis is configured", () => {
    mockCreateRedisClient.mockReturnValue({ redis: true });

    const worker = workerModule.startAIAutomationWorker();

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      "ai-automation",
      workerModule.processAICommentJob,
      {
        connection: { redis: true },
      },
    );
    expect(mockWorkerOn).toHaveBeenCalledTimes(2);
    expect(worker).toBeDefined();
  });
});
