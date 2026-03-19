-- CreateTable
CREATE TABLE "AIProcessingLock" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIProcessingLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStore" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIProcessingLock_commentId_key" ON "AIProcessingLock"("commentId");

-- CreateIndex
CREATE INDEX "EventStore_eventType_createdAt_idx" ON "EventStore"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "EventStore_ticketId_createdAt_idx" ON "EventStore"("ticketId", "createdAt");
