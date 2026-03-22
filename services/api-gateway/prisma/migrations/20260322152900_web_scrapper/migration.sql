-- CreateEnum
CREATE TYPE "ScrapeStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'STALE');

-- CreateTable
CREATE TABLE "ScrapedPage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "contentHash" TEXT,
    "status" "ScrapeStatus" NOT NULL DEFAULT 'PENDING',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "lastScrapedAt" TIMESTAMP(3),
    "lastEmbeddedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapedPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapedPage_orgId_idx" ON "ScrapedPage"("orgId");

-- CreateIndex
CREATE INDEX "ScrapedPage_orgId_status_idx" ON "ScrapedPage"("orgId", "status");

-- CreateIndex
CREATE INDEX "ScrapedPage_lastScrapedAt_idx" ON "ScrapedPage"("lastScrapedAt");

-- CreateIndex
CREATE INDEX "ScrapedPage_createdAt_idx" ON "ScrapedPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedPage_orgId_urlHash_key" ON "ScrapedPage"("orgId", "urlHash");

-- AddForeignKey
ALTER TABLE "ScrapedPage" ADD CONSTRAINT "ScrapedPage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
