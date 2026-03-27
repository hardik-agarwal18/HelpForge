import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWorkerOn = jest.fn();
const mockWorkerWaitUntilReady = jest.fn();
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
    redis: {
      url: "redis://localhost:6379",
      connectTimeoutMs: 10_000,
      maxConnections: 10,
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    },
    database: {
      url: undefined,
      readUrl: undefined,
      poolSize: 10,
      poolTimeout: 20,
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    },
    nodeEnv: "development",
  },
}));

jest.unstable_mockModule(
  "../../../../src/config/redis.config.js",
  () => ({
    createWorkerConnection: mockCreateRedisClient,
    createRedisClient: mockCreateRedisClient,
    getQueueConnection: mockGetSharedBullmqConnection,
    getSharedBullmqConnection: mockGetSharedBullmqConnection,
  }),
);

const { AsyncLocalStorage } = await import("node:async_hooks");
const mockRequestContext = new AsyncLocalStorage();

jest.unstable_mockModule("../../../../src/config/database.config.js", () => ({
  default: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    write: {},
    read: {},
    healthCheck: jest.fn(),
    getMetrics: jest.fn(),
  },
  requestContext: mockRequestContext,
}));

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

const mockGetAIAutomationQueueName = jest.fn(() => "ai-automation");
const mockStoreFailedAIJob = jest.fn();

jest.unstable_mockModule(
  "../../../../src/modules/ai/automation/queue/ai.automation.queue.js",
  () => ({
    getAIAutomationQueueName: mockGetAIAutomationQueueName,
    storeFailedAIJob: mockStoreFailedAIJob,
    enqueueAICommentProcessing: jest.fn(),
  }),
);

const workerModule = await import(
  "../../../../src/modules/ai/automation/queue/ai.automation.worker.js"
);

describe("ai.automation.worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerConstructor.mockImplementation(() => ({
      on: mockWorkerOn,
      waitUntilReady: mockWorkerWaitUntilReady,
    }));
    mockWorkerWaitUntilReady.mockResolvedValue(undefined);
    mockQueueConstructor.mockImplementation(() => ({}));
    mockGetAIAutomationQueueName.mockReturnValue("ai-automation");
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

  it("starts a BullMQ worker when Redis is configured", async () => {
    mockCreateRedisClient.mockReturnValue({ redis: true });

    const worker = await workerModule.startAIAutomationWorker();

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      "ai-automation",
      expect.any(Function),
      {
        connection: { redis: true },
        concurrency: 5,
      },
    );
    expect(mockWorkerOn).toHaveBeenCalledTimes(2);
    expect(mockWorkerWaitUntilReady).toHaveBeenCalledTimes(1);
    expect(worker).toBeDefined();
  });
});
