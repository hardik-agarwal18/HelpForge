import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_TEST,
    },
  },
});

// Clean up the database before each test suite
beforeAll(async () => {
  // Ensure we're using the test database
  if (!process.env.DATABASE_URL_TEST) {
    console.warn("WARNING: DATABASE_URL_TEST is not set.");
  }
});

// Clean up after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
