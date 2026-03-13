import { PrismaClient } from "@prisma/client";
import config from "./index.js";

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

export default prisma;
