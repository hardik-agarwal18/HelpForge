import config from "./config/index.js";
import logger from "./config/logger.js";
import db from "./config/database.config.js";
import { connectRedis, disconnectRedis } from "./config/redis.config.js";
import {
  startAIAutomationWorker,
  stopAIAutomationWorker,
} from "./modules/ai/automation/queue/ai.automation.worker.js";
import {
  startChatbotBridgeWorker,
  stopChatbotBridgeWorker,
} from "./modules/ai/bridge/chatbot.bridge.worker.js";
import {
  startNotificationWorker,
  stopNotificationWorker,
} from "./modules/notifications/queue/notification.worker.js";
import {
  startScraperWorker,
  stopScraperWorker,
} from "./modules/ai/scraper/scraper.worker.js";
import {
  scheduleScrapeCleanup,
  stopScrapeCleanup,
} from "./modules/ai/scraper/scraper.cleanup.cron.js";

const SHUTDOWN_TIMEOUT_MS = config.server.shutdownTimeoutMs;
const WORKER_STOP_TIMEOUT_MS = 5_000;

let isShuttingDown = false;

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);

const startWorkers = async () => {
  await db.connect();
  await connectRedis();

  await Promise.all([
    startAIAutomationWorker(),
    startChatbotBridgeWorker(),
    startNotificationWorker(),
    startScraperWorker(),
  ]);
  scheduleScrapeCleanup();

  logger.info("Worker process ready: DB + Redis + Workers + Crons = OK");
};

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const shutdownStart = Date.now();
  logger.info(
    { phase: "shutdown_started", signal },
    "Worker graceful shutdown initiated",
  );

  const forceTimer = setTimeout(() => {
    logger.error(
      { phase: "shutdown_forced", elapsedMs: Date.now() - shutdownStart },
      "Worker shutdown timed out — forcing exit",
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    // Phase 1: Stop crons
    stopScrapeCleanup();

    logger.info(
      { phase: "crons_stopped", elapsedMs: Date.now() - shutdownStart },
      "Cron jobs stopped",
    );

    // Phase 2: Stop workers
    const workerStops = [
      [
        "scraper",
        () =>
          withTimeout(
            stopScraperWorker(),
            WORKER_STOP_TIMEOUT_MS,
            "scraper-worker",
          ),
      ],
      [
        "chatbot-bridge",
        () =>
          withTimeout(
            stopChatbotBridgeWorker(),
            WORKER_STOP_TIMEOUT_MS,
            "chatbot-bridge-worker",
          ),
      ],
      [
        "ai-automation",
        () =>
          withTimeout(
            stopAIAutomationWorker(),
            WORKER_STOP_TIMEOUT_MS,
            "ai-automation-worker",
          ),
      ],
      [
        "notification",
        () =>
          withTimeout(
            stopNotificationWorker(),
            WORKER_STOP_TIMEOUT_MS,
            "notification-worker",
          ),
      ],
    ];

    const workerResults = await Promise.allSettled(
      workerStops.map(([, stop]) => stop()),
    );

    workerStops.forEach(([name], i) => {
      const result = workerResults[i];
      if (result.status === "rejected") {
        logger.warn(
          {
            phase: "workers_stopped",
            worker: name,
            error: result.reason?.message,
            stack: result.reason?.stack,
          },
          `Worker stop failed: ${name}`,
        );
      }
    });

    logger.info(
      { phase: "workers_stopped", elapsedMs: Date.now() - shutdownStart },
      "All workers stopped",
    );

    // Phase 3: Disconnect data stores
    const storeStops = [
      ["database", () => db.disconnect()],
      ["redis", () => disconnectRedis()],
    ];

    const storeResults = await Promise.allSettled(
      storeStops.map(([, stop]) => stop()),
    );

    storeStops.forEach(([name], i) => {
      const result = storeResults[i];
      if (result.status === "rejected") {
        logger.warn(
          {
            phase: "stores_disconnected",
            store: name,
            error: result.reason?.message,
            stack: result.reason?.stack,
          },
          `Data store disconnect failed: ${name}`,
        );
      }
    });

    logger.info(
      { phase: "shutdown_complete", elapsedMs: Date.now() - shutdownStart },
      "Worker process shutdown complete",
    );
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        phase: "shutdown_error",
        error: error.message,
        elapsedMs: Date.now() - shutdownStart,
      },
      "Error during worker shutdown",
    );
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error(
    {
      error: reason instanceof Error ? reason.message : reason,
      stack: reason?.stack,
    },
    "Unhandled promise rejection (worker)",
  );
});

process.on("uncaughtException", (error) => {
  logger.fatal(
    { error: error.message, stack: error.stack },
    "Uncaught exception (worker) — shutting down",
  );
  gracefulShutdown("uncaughtException");
});

startWorkers().catch((error) => {
  logger.error({ error }, "Failed to start worker process");
  process.exit(1);
});
