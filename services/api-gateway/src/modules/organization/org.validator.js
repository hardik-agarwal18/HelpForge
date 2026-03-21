import { z } from "zod";
import { ROLE_POLICIES } from "./org.constants.js";

const roleValues = Object.keys(ROLE_POLICIES);

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

export const inviteMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: z
    .string()
    .min(1, "Role is required")
    .transform((value) => value.toUpperCase())
    .refine((value) => roleValues.includes(value), {
      message: "Invalid role",
    }),
});

export const updateMemberRoleSchema = z.object({
  role: z
    .string()
    .min(1, "Role is required")
    .transform((value) => value.toUpperCase())
    .refine((value) => roleValues.includes(value), {
      message: "Invalid role",
    }),
});
