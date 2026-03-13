/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,name]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `action` on the `TicketActivityLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TicketActivityAction" AS ENUM ('TICKET_CREATED', 'TICKET_UPDATED', 'TICKET_ASSIGNED', 'TICKET_STATUS_UPDATED', 'COMMENT_ADDED', 'COMMENT_DELETED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED', 'TAG_ADDED', 'TAG_REMOVED');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxTicketsPerDay" INTEGER DEFAULT 10,
ADD COLUMN     "maxTicketsPerWeek" INTEGER DEFAULT 50;

-- AlterTable
ALTER TABLE "TicketActivityLog" DROP COLUMN "action",
ADD COLUMN     "action" "TicketActivityAction" NOT NULL;

-- CreateTable
CREATE TABLE "AgentWorkload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedToday" INTEGER NOT NULL DEFAULT 0,
    "assignedThisWeek" INTEGER NOT NULL DEFAULT 0,
    "lastDailyReset" TIMESTAMP(3) NOT NULL,
    "lastWeeklyReset" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentWorkload_organizationId_idx" ON "AgentWorkload"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWorkload_userId_organizationId_key" ON "AgentWorkload"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_name_key" ON "Tag"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_status_idx" ON "Ticket"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_assignedToId_idx" ON "Ticket"("organizationId", "assignedToId");

-- CreateIndex
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- CreateIndex
CREATE INDEX "TicketActivityLog_ticketId_createdAt_idx" ON "TicketActivityLog"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentWorkload" ADD CONSTRAINT "AgentWorkload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkload" ADD CONSTRAINT "AgentWorkload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
