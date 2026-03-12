import { PrismaClient } from "@prisma/client";

const getDatabaseUrl = () => {
  if (process.env.NODE_ENV === "test") {
    return process.env.DATABASE_URL_TEST;
  }
  return process.env.DATABASE_URL;
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
    },
  },
});

export default prisma;
