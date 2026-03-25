import { z } from "zod";
import { ALL_PERMISSIONS } from "./org.constants.js";

export const createOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Organization name is required"),
  }),
});

export const updateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Organization name is required"),
  }),
  params: z.object({
    orgId: z.string().uuid("Invalid organization ID"),
  }),
});

export const deleteOrganizationSchema = z.object({
  params: z.object({
    orgId: z.string().uuid("Invalid organization ID"),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    userId: z.string().min(1, "User ID is required"),
    roleId: z.string().uuid("Invalid role ID"),
  }),
});

export const updateMemberRoleSchema = z.object({
  body: z.object({
    roleId: z.string().uuid("Invalid role ID"),
  }),
});

// ── Role CRUD schemas ────────────────────────────────────────────────

const permissionsSchema = z
  .array(z.string())
  .min(1, "At least one permission is required")
  .refine((perms) => perms.every((p) => ALL_PERMISSIONS.includes(p)), {
    message: "Invalid permission value",
  });

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Role name is required").max(50),
    permissions: permissionsSchema,
    level: z.number().int().min(1).max(99),
  }),
});

export const updateRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(50).optional(),
    permissions: permissionsSchema.optional(),
    level: z.number().int().min(1).max(99).optional(),
  }),
  params: z.object({
    roleId: z.string().uuid("Invalid role ID"),
  }),
});

export const deleteRoleSchema = z.object({
  params: z.object({
    roleId: z.string().uuid("Invalid role ID"),
  }),
});
