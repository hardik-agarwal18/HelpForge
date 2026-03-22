import { z } from "zod";

const idSchema = z.string().min(1, "ID is required");

export const organizationIdParamSchema = z.object({
  organizationId: idSchema,
});
