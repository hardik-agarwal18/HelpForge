-- CreateEnum
CREATE TYPE "SubmissionMode" AS ENUM ('STRICT', 'GUIDED', 'FLEXIBLE');

-- CreateTable
CREATE TABLE "TicketSubmissionConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mode" "SubmissionMode" NOT NULL DEFAULT 'FLEXIBLE',
    "requireDescription" BOOLEAN NOT NULL DEFAULT true,
    "requireAttachments" BOOLEAN NOT NULL DEFAULT false,
    "minDescriptionLength" INTEGER NOT NULL DEFAULT 0,
    "maxMessagesBeforeAI" INTEGER NOT NULL DEFAULT 3,
    "enableMessageBatching" BOOLEAN NOT NULL DEFAULT true,
    "batchingWindowMs" INTEGER NOT NULL DEFAULT 5000,
    "enableSpamProtection" BOOLEAN NOT NULL DEFAULT true,
    "maxMessagesPerMinute" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSubmissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketSubmissionConfig_organizationId_key" ON "TicketSubmissionConfig"("organizationId");

-- AddForeignKey
ALTER TABLE "TicketSubmissionConfig" ADD CONSTRAINT "TicketSubmissionConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
