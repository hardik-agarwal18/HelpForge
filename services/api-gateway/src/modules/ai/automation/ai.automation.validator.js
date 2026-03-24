import { z } from "zod";
import { TICKET_STATUSES } from "../../tickets/ticket.constants.js";

const idSchema = z.string().min(1, "ID is required");

export const ticketIdParamSchema = z.object({
  ticketId: idSchema,
});

export const organizationIdParamSchema = z.object({
  organizationId: idSchema,
});

export const toggleAISchema = z.object({
  body: z.object({
    aiActive: z.boolean({
      required_error: "aiActive is required",
      invalid_type_error: "aiActive must be a boolean",
    }),
  }),
});

export const overrideDecisionSchema = z.object({
  body: z
    .object({
      action: z.enum(["resolve", "assign"]).optional(),
      assignToId: z.string().min(1, "assignToId is required").optional(),
      status: z
        .string()
        .transform((value) => value.toUpperCase())
        .refine((value) => TICKET_STATUSES.includes(value), {
          message: "Invalid status",
        })
        .optional(),
    })
    .refine((value) => value.action || value.status, {
      message: "Either action or status is required",
    })
    .refine((value) => value.action !== "assign" || !!value.assignToId, {
      message: "assignToId is required when action is assign",
      path: ["assignToId"],
    }),
});
