-- CreateTable
CREATE TABLE "AIProcessingFailures" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobId" TEXT,
    "ticketId" TEXT,
    "commentId" TEXT,
    "attemptsMade" INTEGER NOT NULL DEFAULT 0,
    "retryLimit" INTEGER NOT NULL DEFAULT 0,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT NOT NULL,
    "stacktrace" TEXT,
    "payload" JSONB NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRetriedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProcessingFailures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIProcessingFailures_queueName_failedAt_idx" ON "AIProcessingFailures"("queueName", "failedAt");

-- CreateIndex
CREATE INDEX "AIProcessingFailures_ticketId_failedAt_idx" ON "AIProcessingFailures"("ticketId", "failedAt");

-- CreateIndex
CREATE INDEX "AIProcessingFailures_commentId_failedAt_idx" ON "AIProcessingFailures"("commentId", "failedAt");

-- CreateIndex
CREATE INDEX "AIProcessingFailures_retryable_resolvedAt_failedAt_idx" ON "AIProcessingFailures"("retryable", "resolvedAt", "failedAt");
