import http from "http";
import app from "./app.js";
import config from "./config/index.js";
import logger from "./config/logger.js";
import db from "./config/database.config.js";
import { connectRedis, disconnectRedis } from "./config/redis.config.js";
import { initializeWebsocketGateway } from "./modules/notifications/realtime/socket.gateway.js";

const PORT = config.port;

const server = http.createServer(app);

const listen = () =>
  new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };

    server.once("error", onError);
    server.listen(PORT, () => {
      server.off("error", onError);
      logger.info({ port: PORT }, "API Gateway is running");
      resolve();
    });
  });

const startServer = async () => {
  await db.connect();
  await connectRedis();

  initializeWebsocketGateway(server);

  await listen();
  logger.info("System ready: DB + Redis + WebSocket + API = OK");
};

const SHUTDOWN_TIMEOUT_MS = config.server.shutdownTimeoutMs;

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  app.locals.isShuttingDown = true;

  const shutdownStart = Date.now();
  logger.info(
    { phase: "shutdown_started", signal },
    "Graceful shutdown initiated",
  );

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

      setTimeout(
        () => {
          server.closeAllConnections();
        },
        Math.floor(SHUTDOWN_TIMEOUT_MS * 0.6),
      );
    });

    logger.info(
      { phase: "http_drained", elapsedMs: Date.now() - shutdownStart },
      "HTTP server closed — in-flight requests drained",
    );

    // Phase 2: Disconnect data stores
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
      {
        phase: "shutdown_error",
        error: error.message,
        elapsedMs: Date.now() - shutdownStart,
      },
      "Error during graceful shutdown",
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
