import { Queue } from "bullmq";
import logger from "../../../../config/logger.js";
import { getSharedBullmqConnection } from "../../../../config/redis.config.js";
import aiConfig from "../../core/config/ai.config.js";
import {
  createAIProcessingFailure,
  getAIProcessingFailures,
} from "../ai.automation.repo.js";

const {
  queueName: AI_AUTOMATION_QUEUE_NAME,
  processCommentJobName: PROCESS_COMMENT_JOB_NAME,
  retryLimit: AI_AUTOMATION_RETRY_LIMIT,
  retryBackoffMs: AI_AUTOMATION_RETRY_BACKOFF_MS,
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
export const storeFailedAIJob = async (job, error) => {
  if (!job) {
    return false;
  }

  const dlqEntry = {
    failedAt: new Date(),
    queueName: AI_AUTOMATION_QUEUE_NAME,
    jobName: job.name,
    jobId: job.id,
    ticketId: job.data?.ticketId,
    commentId: job.data?.commentId,
    attemptsMade: job.attemptsMade,
    retryLimit: job.opts?.attempts ?? AI_AUTOMATION_RETRY_LIMIT,
    retryable: true,
    failureReason: error?.message || job.failedReason || "Unknown failure",
    stacktrace: error?.stack || null,
    payload: job.data,
  };

  await createAIProcessingFailure(dlqEntry, AI_AUTOMATION_DLQ_MAX_ENTRIES);

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
  const normalizedLimit = Math.max(1, Math.min(limit, 100));
  return getAIProcessingFailures(normalizedLimit);
};

export const inspectAIAutomationDLQ = async (limit = 50) => {
  const [persistedFailures, failedJobs] = await Promise.all([
    getAIAutomationDLQEntries(limit),
    getFailedAIJobs(limit),
  ]);

  return {
    queueName: AI_AUTOMATION_QUEUE_NAME,
    dlqStorage: "postgres",
    retryLimit: AI_AUTOMATION_RETRY_LIMIT,
    dlqEntryCount: persistedFailures.length,
    failedJobCount: failedJobs.length,
    dlqEntries: persistedFailures,
    persistedFailures,
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
