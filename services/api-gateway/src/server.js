import http from "http";
import app from "./app.js";
import config from "./config/index.js";
import logger from "./config/logger.js";
import db from "./config/database.config.js";
import { disconnectRedis } from "./config/redis.config.js";
import { startAIAutomationWorker } from "./modules/ai/automation/queue/ai.automation.worker.js";
import { startChatbotBridgeWorker } from "./modules/ai/bridge/chatbot.bridge.worker.js";
import { startNotificationWorker } from "./modules/notifications/queue/notification.worker.js";
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

const SHUTDOWN_TIMEOUT_MS =
  parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 15_000;

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(
    { signal },
    "Received shutdown signal — starting graceful shutdown",
  );

  // Force exit if shutdown hangs
  const forceTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    // 1. Stop accepting new connections + drain in-flight requests
    await new Promise((resolve, reject) => {
      // Destroy idle keep-alive sockets so they don't hold the server open
      server.closeIdleConnections();

      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });

      // After a grace period, forcibly close remaining connections
      setTimeout(
        () => {
          server.closeAllConnections();
        },
        Math.floor(SHUTDOWN_TIMEOUT_MS * 0.6),
      );
    });

    logger.info("HTTP server closed — all in-flight requests completed");

    // 2. Stop workers + crons (stop consuming before disconnecting backends)
    stopScrapeCleanup();
    await stopScraperWorker();

    // 3. Disconnect data stores
    await Promise.allSettled([db.disconnect(), disconnectRedis()]);

    logger.info("API Gateway shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, "Error during graceful shutdown");
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startServer().catch((error) => {
  logger.error({ error }, "Failed to start API Gateway");
  process.exit(1);
});
