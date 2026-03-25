-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- Seed permission catalog from existing OrgRole.permissions arrays
INSERT INTO "Permission" ("id", "name", "description", "resource", "action")
SELECT
  gen_random_uuid()::TEXT,
  permission_value,
  initcap(replace(replace(permission_value, ':', ' '), '_', ' ')),
  split_part(permission_value, ':', 1),
  split_part(permission_value, ':', 2)
FROM (
  SELECT DISTINCT unnest("permissions") AS permission_value
  FROM "OrgRole"
) seeded_permissions
WHERE permission_value IS NOT NULL;

-- Backfill role-permission relations
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT
  role_permission_map."id",
  permission_catalog."id"
FROM (
  SELECT
    "id",
    unnest("permissions") AS permission_name
  FROM "OrgRole"
) role_permission_map
JOIN "Permission" permission_catalog
  ON permission_catalog."name" = role_permission_map.permission_name;

-- Drop old array column
ALTER TABLE "OrgRole" DROP COLUMN "permissions";

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "OrgRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
