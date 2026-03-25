-- Supports auth/org queries that filter memberships by userId only
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
