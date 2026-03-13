import { z } from "zod";
import { TICKET_PRIORITIES, TICKET_SOURCES } from "./ticket.constants.js";

export const createTicketSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().trim().optional(),
  priority: z
    .string()
    .transform((value) => value.toUpperCase())
    .refine((value) => TICKET_PRIORITIES.includes(value), {
      message: "Invalid priority",
    })
    .optional(),
  source: z
    .string()
    .transform((value) => value.toUpperCase())
    .refine((value) => TICKET_SOURCES.includes(value), {
      message: "Invalid source",
    })
    .optional(),
  assignedToId: z.string().min(1, "Assigned user ID is required").optional(),
});
