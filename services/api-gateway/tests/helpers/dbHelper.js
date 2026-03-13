import { PrismaClient } from "@prisma/client";

// Use a singleton pattern for the test database connection
let prismaInstance = null;

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

  // Delete all records from all tables in reverse order of dependencies
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
