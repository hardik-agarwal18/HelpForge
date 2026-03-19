-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "category" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "resolutionSummary" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT;
