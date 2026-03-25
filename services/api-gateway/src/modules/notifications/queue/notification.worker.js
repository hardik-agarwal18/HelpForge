import { Worker } from "bullmq";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";
import { createWorkerConnection } from "../../../config/redis.config.js";
import { sendNotification } from "../notification.provider.js";
import { getNotificationQueueName } from "./notification.queue.js";

let worker;

export const processNotificationJob = async (job) => {
  await sendNotification(job.data);

  return {
    processed: true,
    jobId: job.id,
  };
};

export const startNotificationWorker = async () => {
  if (!config.redis.url || config.nodeEnv === "test") {
    logger.info("Notification worker skipped (missing REDIS_URL or test mode)");
    return null;
  }

  if (worker) {
    await worker.waitUntilReady();
    return worker;
  }

  const connection = createWorkerConnection("notification");

  if (!connection) {
    logger.info("Notification worker skipped (Redis client unavailable)");
    return null;
  }

  worker = new Worker(getNotificationQueueName(), processNotificationJob, {
    connection,
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "Notification job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        err: error,
      },
      "Notification job failed",
    );
  });

  try {
    await worker.waitUntilReady();
    logger.info("Notification worker ready");
    return worker;
  } catch (error) {
    logger.error({ err: error }, "Notification worker failed to become ready");
    await worker.close().catch(() => {});
    worker = null;
    throw error;
  }
};

export const stopNotificationWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
};

export default {
  processNotificationJob,
  startNotificationWorker,
  stopNotificationWorker,
};
