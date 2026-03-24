import { PrismaClient } from "@prisma/client";
import config from "./index.js";
import logger from "./logger.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getDatabaseUrl = (role) => {
  if (config.nodeEnv === "test") {
    return config.database.testUrl;
  }
  if (role === "read") {
    return config.database.readUrl || config.database.url;
  }
  return config.database.url;
};

const connectWithRetry = async (client, role) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await client.$connect();
      logger.info({ environment: config.nodeEnv, role }, `SQL database connected (${role})`);
      return;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        logger.error(
          { error: error.message, attempts: attempt, role },
          `Failed to connect to SQL database (${role}) after all retries`,
        );
        throw error;
      }
      logger.warn(
        { error: error.message, attempt, maxRetries: MAX_RETRIES, role },
        `SQL database connection attempt failed (${role}), retrying`,
      );
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
};

function createDatabaseManager() {
  const writeClient = new PrismaClient({
    datasources: { db: { url: getDatabaseUrl("write") } },
  });

  const readClient = new PrismaClient({
    datasources: { db: { url: getDatabaseUrl("read") } },
  });

  let connectPromise = null;

  const connect = async () => {
    if (connectPromise) return connectPromise;

    connectPromise = Promise.all([
      connectWithRetry(writeClient, "write"),
      connectWithRetry(readClient, "read"),
    ]).catch((error) => {
      connectPromise = null;
      throw error;
    });

    return connectPromise;
  };

  const disconnect = async () => {
    connectPromise = null;
    const errors = [];

    for (const [client, role] of [
      [writeClient, "write"],
      [readClient, "read"],
    ]) {
      try {
        await client.$disconnect();
        logger.info({ role }, `SQL database disconnected (${role})`);
      } catch (error) {
        logger.error(
          { error: error.message, role },
          `Failed to disconnect from SQL database (${role})`,
        );
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to disconnect database clients");
    }
  };

  const healthCheck = async () => {
    const check = async (client, role) => {
      try {
        await Promise.race([
          client.$queryRaw`SELECT 1`,
          sleep(HEALTH_CHECK_TIMEOUT_MS).then(() => {
            throw new Error(`Health check timed out (${role})`);
          }),
        ]);
        return true;
      } catch (error) {
        logger.warn(
          { error: error.message, role },
          `Database health check failed (${role})`,
        );
        return false;
      }
    };

    const [write, read] = await Promise.all([
      check(writeClient, "write"),
      check(readClient, "read"),
    ]);

    return { write, read };
  };

  return Object.freeze({
    write: writeClient,
    read: readClient,
    connect,
    disconnect,
    healthCheck,
  });
}

const db = createDatabaseManager();

export default db;
