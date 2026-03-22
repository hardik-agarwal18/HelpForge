import { z } from "zod";

const aiConfigBody = z.object({
  allowedModels: z.array(z.string()).optional(),
  maxTokensPerRequest: z.number().int().positive().optional(),
  maxCostPerDay: z.number().positive().nullable().optional(),
  enableAutoResolve: z.boolean().optional(),
  enableSmartAssign: z.boolean().optional(),
  autoResolveThreshold: z.number().min(0).max(1).optional(),
  suggestThreshold: z.number().min(0).max(1).optional(),
  smartAssignThreshold: z.number().min(0).max(1).optional(),
  maxAIResponses: z.number().int().positive().optional(),
  aiEnabled: z.boolean().optional(),
});

export const createAIConfigSchema = z.object({
  body: aiConfigBody,
  params: z.object({ orgId: z.string().uuid() }),
  query: z.object({}),
});

export const updateAIConfigSchema = z.object({
  body: aiConfigBody,
  params: z.object({ orgId: z.string().uuid() }),
  query: z.object({}),
});

export const getAIConfigSchema = z.object({
  body: z.object({}),
  params: z.object({ orgId: z.string().uuid() }),
  query: z.object({}),
});
