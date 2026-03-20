import { z } from "zod";

export const organizationIdParamSchema = z.object({
  organizationId: idSchema,
});
