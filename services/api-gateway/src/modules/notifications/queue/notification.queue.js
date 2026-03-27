import { Queue } from "bullmq";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";
import { getQueueConnection } from "../../../config/redis.config.js";
import { withRequestId } from "../../../utils/requestId.js";

const NOTIFICATION_QUEUE_NAME = "notification-delivery";

let queue;

const getQueue = () => {
  const redisConnection = getQueueConnection();

  if (!redisConnection) {
    return null;
  }

  if (!queue) {
    queue = new Queue(NOTIFICATION_QUEUE_NAME, {
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

export const enqueueNotification = async (notification) => {
  const notificationQueue = getQueue();

  if (!notificationQueue) {
    logger.warn("Notification queue disabled because REDIS_URL is not set");
    return {
      queued: false,
      notification,
    };
  }

  const job = await notificationQueue.add("deliver-notification", withRequestId(notification));

  return {
    queued: true,
    jobId: job.id,
  };
};

export const getNotificationQueueName = () => NOTIFICATION_QUEUE_NAME;

export default {
  enqueueNotification,
  getNotificationQueueName,
};
