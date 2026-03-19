import { z } from "zod";

const idSchema = z.string().min(1, "ID is required");

export const ticketIdParamSchema = z.object({
  ticketId: idSchema,
});

export const agentIdParamSchema = z.object({
  agentId: idSchema,
});

export const organizationIdParamSchema = z.object({
  organizationId: idSchema,
});

export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});
