-- CreateTable: OrgRole
CREATE TABLE "OrgRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "permissions" TEXT[],
    "level" INTEGER NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgRole_organizationId_idx" ON "OrgRole"("organizationId");
CREATE UNIQUE INDEX "OrgRole_organizationId_name_key" ON "OrgRole"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "OrgRole" ADD CONSTRAINT "OrgRole_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default roles for every existing organization
INSERT INTO "OrgRole" ("id", "name", "organizationId", "permissions", "level", "isSystem", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  role_def.name,
  o."id",
  role_def.permissions,
  role_def.level,
  true,
  NOW(),
  NOW()
FROM "Organization" o
CROSS JOIN (VALUES
  ('OWNER',  100, ARRAY['org:update','org:delete','org:invite_member','org:manage_member','org:view_members','role:create','role:update','role:delete','ticket:view_all','ticket:edit_all','ticket:assign','ticket:create_internal_comment','ticket:delete_any_comment','ticket:delete_any_attachment','agent:update_availability','ai:manage_config']),
  ('ADMIN',   75, ARRAY['org:update','org:invite_member','org:manage_member','org:view_members','role:create','role:update','role:delete','ticket:view_all','ticket:edit_all','ticket:assign','ticket:create_internal_comment','ticket:delete_any_comment','ticket:delete_any_attachment','ai:manage_config']),
  ('AGENT',   50, ARRAY['org:view_members','ticket:view_all','ticket:edit_all','ticket:assign','ticket:create_internal_comment','ticket:delete_any_comment','ticket:delete_any_attachment','agent:update_availability']),
  ('MEMBER',  10, ARRAY['org:view_members'])
) AS role_def(name, level, permissions);

-- Add roleId column (nullable initially)
ALTER TABLE "Membership" ADD COLUMN "roleId" TEXT;

-- Populate roleId from existing role enum
UPDATE "Membership" m
SET "roleId" = r."id"
FROM "OrgRole" r
WHERE r."organizationId" = m."organizationId"
  AND r."name" = m."role"::TEXT;

-- Make roleId NOT NULL now that it's populated
ALTER TABLE "Membership" ALTER COLUMN "roleId" SET NOT NULL;

-- DropIndex (old role-based index)
DROP INDEX IF EXISTS "Membership_organizationId_role_isAvailable_createdAt_idx";

-- Drop old role column and enum
ALTER TABLE "Membership" DROP COLUMN "role";
DROP TYPE IF EXISTS "Role";

-- CreateIndex (new roleId-based index)
CREATE INDEX "Membership_organizationId_roleId_isAvailable_createdAt_idx"
  ON "Membership"("organizationId", "roleId", "isAvailable", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "OrgRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
