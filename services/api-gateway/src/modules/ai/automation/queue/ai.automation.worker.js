import { Worker } from "bullmq";
import config from "../../../../config/index.js";
import logger from "../../../../config/logger.js";
import { createWorkerConnection } from "../../../../config/redis.config.js";
import { handleCommentAdded } from "../ai.automation.service.js";
import {
  getAIAutomationQueueName,
  storeFailedAIJob,
} from "./ai.automation.queue.js";

let worker;

export const processAICommentJob = async (job) => {
  await handleCommentAdded(job.data);

  return {
    processed: true,
    jobId: job.id,
  };
};

export const startAIAutomationWorker = () => {
  if (!config.redis.url || config.nodeEnv === "test") {
    logger.info(
      "AI automation worker skipped (missing REDIS_URL or test mode)",
    );
    return null;
  }

  if (worker) {
    return worker;
  }

  const connection = createWorkerConnection("ai-automation");

  if (!connection) {
    logger.info("AI automation worker skipped (Redis client unavailable)");
    return null;
  }

  worker = new Worker(getAIAutomationQueueName(), processAICommentJob, {
    connection,
    concurrency: 5, // or dynamic
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "AI automation job completed");
  });

  worker.on("failed", async (job, error) => {
    const retryLimit = job?.opts?.attempts ?? 0;
    const exhaustedRetries = Boolean(job) && job.attemptsMade >= retryLimit;

    logger.error(
      {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        retryLimit,
        exhaustedRetries,
        err: error,
      },
      "AI automation job failed",
    );

    if (exhaustedRetries) {
      try {
        const stored = await storeFailedAIJob(job, error);

        logger.error(
          {
            jobId: job?.id,
            stored,
          },
          "AI automation job moved to DLQ",
        );
      } catch (dlqError) {
        logger.error(
          {
            jobId: job?.id,
            err: dlqError,
          },
          "Failed to persist AI automation job in DLQ",
        );
      }
    }
  });

  return worker;
};

export const stopAIAutomationWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
};

export default {
  processAICommentJob,
  startAIAutomationWorker,
};
