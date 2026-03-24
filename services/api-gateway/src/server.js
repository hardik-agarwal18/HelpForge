import http from "http";
import app from "./app.js";
import config from "./config/index.js";
import logger from "./config/logger.js";
import db from "./config/database.config.js";
import { disconnectRedis } from "./config/redis.config.js";
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
import { initializeWebsocketGateway } from "./modules/notifications/realtime/socket.gateway.js";
import {
  startScraperWorker,
  stopScraperWorker,
} from "./modules/ai/scraper/scraper.worker.js";
import {
  scheduleScrapeCleanup,
  stopScrapeCleanup,
} from "./modules/ai/scraper/scraper.cleanup.cron.js";

const PORT = config.port;

const server = http.createServer(app);

const startServer = async () => {
  await db.connect();

  initializeWebsocketGateway(server);
  startAIAutomationWorker();
  startChatbotBridgeWorker();
  startNotificationWorker();
  startScraperWorker();
  scheduleScrapeCleanup();

  server.listen(PORT, () => {
    logger.info({ port: PORT }, "API Gateway is running");
  });
};

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

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  app.locals.isShuttingDown = true;

  const shutdownStart = Date.now();
  logger.info({ phase: "shutdown_started", signal }, "Graceful shutdown initiated");

  // Force exit if shutdown hangs
  const forceTimer = setTimeout(() => {
    logger.error(
      { phase: "shutdown_forced", elapsedMs: Date.now() - shutdownStart },
      "Graceful shutdown timed out — forcing exit",
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    // Phase 1: Stop accepting new connections + drain in-flight requests
    await new Promise((resolve, reject) => {
      server.closeIdleConnections();

      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });

      setTimeout(() => {
        server.closeAllConnections();
      }, Math.floor(SHUTDOWN_TIMEOUT_MS * 0.6));
    });

    logger.info(
      { phase: "http_drained", elapsedMs: Date.now() - shutdownStart },
      "HTTP server closed — in-flight requests drained",
    );

    // Phase 2: Stop crons
    stopScrapeCleanup();

    logger.info(
      { phase: "crons_stopped", elapsedMs: Date.now() - shutdownStart },
      "Cron jobs stopped",
    );

    // Phase 3: Stop workers that depend on queues (consume jobs)
    const workerStops = [
      ["scraper", () => withTimeout(stopScraperWorker(), WORKER_STOP_TIMEOUT_MS, "scraper-worker")],
      ["chatbot-bridge", () => withTimeout(stopChatbotBridgeWorker(), WORKER_STOP_TIMEOUT_MS, "chatbot-bridge-worker")],
      ["ai-automation", () => withTimeout(stopAIAutomationWorker(), WORKER_STOP_TIMEOUT_MS, "ai-automation-worker")],
      ["notification", () => withTimeout(stopNotificationWorker(), WORKER_STOP_TIMEOUT_MS, "notification-worker")],
    ];

    const workerResults = await Promise.allSettled(
      workerStops.map(([, stop]) => stop()),
    );

    workerStops.forEach(([name], i) => {
      const result = workerResults[i];
      if (result.status === "rejected") {
        logger.warn(
          { phase: "workers_stopped", worker: name, error: result.reason?.message, stack: result.reason?.stack },
          `Worker stop failed: ${name}`,
        );
      }
    });

    logger.info(
      { phase: "workers_stopped", elapsedMs: Date.now() - shutdownStart },
      "All workers stopped",
    );

    // Phase 4: Disconnect data stores (after workers are done using them)
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
          { phase: "stores_disconnected", store: name, error: result.reason?.message, stack: result.reason?.stack },
          `Data store disconnect failed: ${name}`,
        );
      }
    });

    logger.info(
      { phase: "stores_disconnected", elapsedMs: Date.now() - shutdownStart },
      "Data stores disconnected",
    );

    logger.info(
      { phase: "shutdown_complete", elapsedMs: Date.now() - shutdownStart },
      "API Gateway shutdown complete",
    );
    process.exit(0);
  } catch (error) {
    logger.error(
      { phase: "shutdown_error", error: error.message, elapsedMs: Date.now() - shutdownStart },
      "Error during graceful shutdown",
    );
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error(
    { error: reason instanceof Error ? reason.message : reason, stack: reason?.stack },
    "Unhandled promise rejection",
  );
});

process.on("uncaughtException", (error) => {
  logger.fatal(
    { error: error.message, stack: error.stack },
    "Uncaught exception — shutting down",
  );
  gracefulShutdown("uncaughtException");
});

startServer().catch((error) => {
  logger.error({ error }, "Failed to start API Gateway");
  process.exit(1);
});
