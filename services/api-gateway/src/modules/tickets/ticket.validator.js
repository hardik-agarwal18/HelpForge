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

export const updateTicketSchema = z
  .object({
    title: z.string().min(1, "Title is required").optional(),
    description: z.string().trim().optional(),
    priority: z
      .string()
      .transform((value) => value.toUpperCase())
      .refine((value) => TICKET_PRIORITIES.includes(value), {
        message: "Invalid priority",
      })
      .optional(),
    status: z
      .string()
      .transform((value) => value.toUpperCase())
      .refine((value) => ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(value), {
        message: "Invalid status",
      })
      .optional(),
    assignedToId: z.string().min(1, "Assigned user ID is required").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const createTicketCommentSchema = z.object({
  message: z.string().min(1, "Message is required"),
  isInternal: z.boolean().optional(),
});

export const createTicketAttachmentSchema = z.object({
  fileUrl: z.string().url("Valid file URL is required"),
  fileType: z.string().min(1, "File type is required"),
  fileSize: z.number().int().positive("File size must be a positive integer"),
});

export const assignTicketSchema = z.object({
  assignedToId: z.string().min(1, "Assigned user ID is required"),
});

export const updateTicketStatusSchema = z.object({
  status: z
    .string()
    .transform((value) => value.toUpperCase())
    .refine((value) => ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(value), {
      message: "Invalid status",
    }),
});

export const createTagSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().trim().min(1, "Tag name is required"),
});

export const getTagsSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export const addTicketTagSchema = z.object({
  tagId: z.string().min(1, "Tag ID is required"),
});
