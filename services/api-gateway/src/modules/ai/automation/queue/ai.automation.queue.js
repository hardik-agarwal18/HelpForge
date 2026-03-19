import { Queue } from "bullmq";
import logger from "../../../../config/logger.js";
import { getSharedBullmqConnection } from "../../../../config/redis.config.js";
import aiConfig from "../../core/config/ai.config.js";

const {
  queueName: AI_AUTOMATION_QUEUE_NAME,
  processCommentJobName: PROCESS_COMMENT_JOB_NAME,
  retryLimit: AI_AUTOMATION_RETRY_LIMIT,
  retryBackoffMs: AI_AUTOMATION_RETRY_BACKOFF_MS,
  dlqKey: AI_AUTOMATION_DLQ_KEY,
  dlqMaxEntries: AI_AUTOMATION_DLQ_MAX_ENTRIES,
} = aiConfig.automation;

let queue;

const getQueue = () => {
  const redisConnection = getSharedBullmqConnection();

  if (!redisConnection) {
    return null;
  }

  if (!queue) {
    queue = new Queue(AI_AUTOMATION_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: AI_AUTOMATION_RETRY_LIMIT,
        backoff: {
          type: "exponential",
          delay: AI_AUTOMATION_RETRY_BACKOFF_MS,
        },
        removeOnComplete: {
          count: 1000,
        },
        removeOnFail: {
          count: 1000,
        },
      },
    });
  }

  return queue;
};

const getDLQConnection = () => getSharedBullmqConnection();

export const storeFailedAIJob = async (job, error) => {
  const redisConnection = getDLQConnection();

  if (!redisConnection || !job) {
    return false;
  }

  const dlqEntry = {
    storedAt: new Date().toISOString(),
    queueName: AI_AUTOMATION_QUEUE_NAME,
    jobName: job.name,
    jobId: job.id,
    attemptsMade: job.attemptsMade,
    retryLimit: job.opts?.attempts ?? AI_AUTOMATION_RETRY_LIMIT,
    failedReason: error?.message || job.failedReason || "Unknown failure",
    stacktrace: error?.stack || null,
    payload: job.data,
  };

  await redisConnection.lpush(AI_AUTOMATION_DLQ_KEY, JSON.stringify(dlqEntry));
  await redisConnection.ltrim(
    AI_AUTOMATION_DLQ_KEY,
    0,
    Math.max(0, AI_AUTOMATION_DLQ_MAX_ENTRIES - 1),
  );

  return true;
};

export const getFailedAIJobs = async (limit = 50) => {
  const automationQueue = getQueue();

  if (!automationQueue) {
    return [];
  }

  const normalizedLimit = Math.max(1, Math.min(limit, 100));
  const failedJobs = await automationQueue.getJobs(
    ["failed"],
    0,
    normalizedLimit - 1,
    false,
  );

  return failedJobs.map((job) => ({
    id: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    retryLimit: job.opts?.attempts ?? AI_AUTOMATION_RETRY_LIMIT,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
    data: job.data,
  }));
};

export const getAIAutomationDLQEntries = async (limit = 50) => {
  const redisConnection = getDLQConnection();

  if (!redisConnection) {
    return [];
  }

  const normalizedLimit = Math.max(1, Math.min(limit, 100));
  const entries = await redisConnection.lrange(
    AI_AUTOMATION_DLQ_KEY,
    0,
    normalizedLimit - 1,
  );

  return entries.map((entry) => {
    try {
      return JSON.parse(entry);
    } catch (error) {
      return {
        storedAt: new Date().toISOString(),
        parseError: error.message,
        rawEntry: entry,
      };
    }
  });
};

export const inspectAIAutomationDLQ = async (limit = 50) => {
  const [dlqEntries, failedJobs] = await Promise.all([
    getAIAutomationDLQEntries(limit),
    getFailedAIJobs(limit),
  ]);

  return {
    queueName: AI_AUTOMATION_QUEUE_NAME,
    dlqKey: AI_AUTOMATION_DLQ_KEY,
    retryLimit: AI_AUTOMATION_RETRY_LIMIT,
    dlqEntryCount: dlqEntries.length,
    failedJobCount: failedJobs.length,
    dlqEntries,
    failedJobs,
  };
};

export const enqueueAICommentProcessing = async (payload) => {
  const automationQueue = getQueue();

  if (!automationQueue) {
    logger.warn("AI automation queue disabled because REDIS_URL is not set");
    return {
      queued: false,
      payload,
    };
  }

  const job = await automationQueue.add(PROCESS_COMMENT_JOB_NAME, payload, {
    jobId: `${payload.ticketId}:${payload.commentId}`,
  });

  return {
    queued: true,
    jobId: job.id,
  };
};

export const getAIAutomationQueueName = () => AI_AUTOMATION_QUEUE_NAME;

export const getAIAutomationJobName = () => PROCESS_COMMENT_JOB_NAME;

export default {
  enqueueAICommentProcessing,
  storeFailedAIJob,
  getFailedAIJobs,
  getAIAutomationDLQEntries,
  inspectAIAutomationDLQ,
  getAIAutomationQueueName,
  getAIAutomationJobName,
};
