import { PrismaClient } from "@prisma/client";
import config from "./index.js";
import logger from "./logger.js";

const getDatabaseUrl = () => {
  if (config.nodeEnv === "test") {
    return config.database.testUrl;
  }
  return config.database.url;
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
    },
  },
});

let isSqlConnected = false;

export const connectDatabase = async () => {
  if (isSqlConnected) {
    return prisma;
  }

  await prisma.$connect();
  isSqlConnected = true;

  logger.info({ environment: config.nodeEnv }, "SQL database connected");

  return prisma;
};

export const disconnectDatabase = async () => {
  if (!isSqlConnected) {
    return;
  }

  await prisma.$disconnect();
  isSqlConnected = false;

  logger.info("SQL database disconnected");
};

export default prisma;
