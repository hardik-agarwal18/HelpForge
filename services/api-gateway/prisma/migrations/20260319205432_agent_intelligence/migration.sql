-- AlterTable
ALTER TABLE "AgentWorkload" ADD COLUMN     "activeTickets" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skills" TEXT[];
