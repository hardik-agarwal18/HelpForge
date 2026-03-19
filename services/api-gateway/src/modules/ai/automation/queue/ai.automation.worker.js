import { Worker } from "bullmq";
import config from "../../../../config/index.js";
import logger from "../../../../config/logger.js";
import { createRedisClient } from "../../../../config/redis.config.js";
import { handleCommentAdded } from "../ai.automation.service.js";
import { getAIAutomationQueueName } from "./ai.automation.queue.js";

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
    logger.info("AI automation worker skipped (missing REDIS_URL or test mode)");
    return null;
  }

  if (worker) {
    return worker;
  }

  const connection = createRedisClient();

  if (!connection) {
    logger.info("AI automation worker skipped (Redis client unavailable)");
    return null;
  }

  worker = new Worker(getAIAutomationQueueName(), processAICommentJob, {
    connection,
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "AI automation job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        err: error,
      },
      "AI automation job failed",
    );
  });

  return worker;
};

export default {
  processAICommentJob,
  startAIAutomationWorker,
};
