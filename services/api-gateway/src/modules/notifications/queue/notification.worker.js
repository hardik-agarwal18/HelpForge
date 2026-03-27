import { Worker } from "bullmq";
import db from "../../../config/database.config.js";
import config from "../../../config/index.js";
import logger from "../../../config/logger.js";
import { createWorkerConnection } from "../../../config/redis.config.js";
import { runWithJobContext } from "../../../utils/requestId.js";
import { sendNotification } from "../notification.provider.js";
import { getNotificationQueueName } from "./notification.queue.js";

// ── DLQ persistence ──────────────────────────────────────────────────────────

const persistFailure = async (job, error) => {
  try {
    await db.write.aIProcessingFailure.create({
      data: {
        queueName: getNotificationQueueName(),
        jobName: job?.name ?? "unknown",
        jobId: job?.id ?? null,
        attemptsMade: job?.attemptsMade ?? 0,
        retryLimit: job?.opts?.attempts ?? 3,
        retryable: false,
        failureReason: error?.message?.slice(0, 1000) ?? "unknown",
        stacktrace: error?.stack?.slice(0, 3000) ?? null,
        payload: job?.data ?? {},
      },
    });
  } catch (dbErr) {
    logger.error({ dbErr }, "notification.worker: failed to persist DLQ entry");
  }
};

// ── Worker ───────────────────────────────────────────────────────────────────

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

  worker = new Worker(getNotificationQueueName(), runWithJobContext(processNotificationJob), {
    connection,
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "Notification job completed");
  });

  worker.on("failed", async (job, error) => {
    const isFinalAttempt = job && job.attemptsMade >= (job.opts?.attempts ?? 3);

    logger.error(
      {
        jobId: job?.id,
        err: error,
        attempts: job?.attemptsMade,
        isFinalAttempt,
      },
      "Notification job failed",
    );

    if (isFinalAttempt) {
      await persistFailure(job, error);
    }
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
