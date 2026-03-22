import http from "http";
import app from "./app.js";
import config from "./config/index.js";
import logger from "./config/logger.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.config.js";
import { getSharedBullmqConnection } from "./config/redis.config.js";
import { startAIAutomationWorker } from "./modules/ai/automation/queue/ai.automation.worker.js";
import { startChatbotBridgeWorker } from "./modules/ai/bridge/chatbot.bridge.worker.js";
import { startNotificationWorker } from "./modules/notifications/queue/notification.worker.js";
import { initializeWebsocketGateway } from "./modules/notifications/realtime/socket.gateway.js";
import { startScraperWorker } from "./modules/ai/scraper/scraper.worker.js";
import { scheduleScrapeCleanup, stopScrapeCleanup } from "./modules/ai/scraper/scraper.cleanup.cron.js";

const PORT = config.port;

const server = http.createServer(app);

const startServer = async () => {
  await connectDatabase();

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

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, "Received shutdown signal");

  server.close(async () => {
    try {
      await disconnectDatabase();

      const redisConnection = getSharedBullmqConnection();
      if (redisConnection) {
        await redisConnection.quit();
        logger.info("Redis connection closed gracefully");
      }

      stopScrapeCleanup();
      logger.info("API Gateway shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error({ error }, "Error during graceful shutdown");
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

startServer().catch((error) => {
  logger.error({ error }, "Failed to start API Gateway");
  process.exit(1);
});
