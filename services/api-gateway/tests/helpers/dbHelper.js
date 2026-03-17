import { PrismaClient } from "@prisma/client";

// Use a singleton pattern for the test database connection
let prismaInstance = null;

const waitForEventLoopDrain = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};

export const getTestPrisma = () => {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_TEST,
        },
      },
    });
  }
  return prismaInstance;
};

// Clean all tables in the database
export const cleanDatabase = async () => {
  const prisma = getTestPrisma();

  // Event handlers run asynchronously via setImmediate and can create
  // activity logs during cleanup. Drain once before deleting data.
  await waitForEventLoopDrain();

  // Retry cleanup when a late async handler races and recreates dependent rows.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // Delete all records from all tables in reverse order of dependencies.
      await prisma.notification.deleteMany({});
      await prisma.ticketActivityLog.deleteMany({});
      await prisma.ticketTag.deleteMany({});
      await prisma.ticketAttachment.deleteMany({});
      await prisma.ticketComment.deleteMany({});
      await prisma.ticket.deleteMany({});
      await prisma.tag.deleteMany({});
      await prisma.agentWorkload.deleteMany({});
      await prisma.membership.deleteMany({});
      await prisma.organization.deleteMany({});
      await prisma.user.deleteMany({});
      return;
    } catch (error) {
      const isForeignKeyError = error?.code === "P2003";
      if (!isForeignKeyError || attempt === 3) {
        throw error;
      }

      await waitForEventLoopDrain();
    }
  }
};

// Disconnect from the database
export const disconnectDatabase = async () => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
};

// Create a test user
export const createTestUser = async (userData = {}) => {
  const prisma = getTestPrisma();

  const defaultUserData = {
    email: `test${Date.now()}@example.com`,
    password: "$2b$10$YourHashedPasswordHere", // Pre-hashed password
    name: "Test User",
    ...userData,
  };

  return await prisma.user.create({
    data: defaultUserData,
  });
};
