import { Queue } from "bullmq";
import logger from "../../../../config/logger.js";
import { getSharedBullmqConnection } from "../../../../config/redis.config.js";

const AI_AUTOMATION_QUEUE_NAME = "ai-automation";
const PROCESS_COMMENT_JOB_NAME = "process-ticket-comment";

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
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
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
  getAIAutomationQueueName,
  getAIAutomationJobName,
};
