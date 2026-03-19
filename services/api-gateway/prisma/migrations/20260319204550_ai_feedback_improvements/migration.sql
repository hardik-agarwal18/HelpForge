-- AlterTable
ALTER TABLE "AIConfig" ADD COLUMN     "allowedModels" TEXT[] DEFAULT ARRAY['gpt-4', 'gpt-3.5']::TEXT[],
ADD COLUMN     "enableAutoResolve" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableSmartAssign" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxCostPerDay" DOUBLE PRECISION,
ADD COLUMN     "maxTokensPerRequest" INTEGER NOT NULL DEFAULT 2000;

-- AlterTable
ALTER TABLE "TicketComment" ADD COLUMN     "metadata" JSONB;

-- AddForeignKey
ALTER TABLE "AIDecisionLog" ADD CONSTRAINT "AIDecisionLog_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TicketComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TicketComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
