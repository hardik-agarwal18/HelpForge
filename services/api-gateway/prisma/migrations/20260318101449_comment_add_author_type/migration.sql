/*
  Warnings:

  - Added the required column `authorType` to the `TicketComment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CommentAuthorType" AS ENUM ('USER', 'AI', 'SYSTEM');

-- DropForeignKey
ALTER TABLE "TicketComment" DROP CONSTRAINT "TicketComment_authorId_fkey";

-- AlterTable
ALTER TABLE "TicketComment" ADD COLUMN     "authorType" "CommentAuthorType" NOT NULL,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
