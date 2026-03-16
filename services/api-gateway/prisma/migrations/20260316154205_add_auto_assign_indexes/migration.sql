-- CreateIndex
CREATE INDEX "AgentWorkload_organizationId_assignedToday_assignedThisWeek_idx" ON "AgentWorkload"("organizationId", "assignedToday", "assignedThisWeek", "userId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_isAvailable_createdAt_idx" ON "Membership"("organizationId", "role", "isAvailable", "createdAt");
