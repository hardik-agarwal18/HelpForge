import IORedis from "ioredis";
import { Queue } from "bullmq";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";

const NOTIFICATION_QUEUE_NAME = "notification-delivery";

let connection;
let queue;

const getRedisConnection = () => {
  if (!config.redis.url) {
    return null;
  }

  if (!connection) {
    connection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return connection;
};

const getQueue = () => {
  const redisConnection = getRedisConnection();

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

  const job = await notificationQueue.add("deliver-notification", notification);

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
