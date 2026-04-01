import { z } from "zod";

export const extractedItemSchema = z.object({
  title: z.string().min(1),
  priceText: z.string().min(1),
  url: z.string().min(1),
  shopText: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

export const clickActionSchema = z.object({
  type: z.literal("CLICK"),
  agentId: z.string().min(1),
});

export const typeActionSchema = z.object({
  type: z.literal("TYPE"),
  agentId: z.string().min(1),
  text: z.string().min(1),
  submit: z.boolean().optional(),
});

export const scrollActionSchema = z.object({
  type: z.literal("SCROLL"),
  direction: z.union([z.literal("up"), z.literal("down")]),
  amount: z.number().positive().optional(),
});

export const extractListActionSchema = z.object({
  type: z.literal("EXTRACT_LIST"),
});

export const doneActionSchema = z.object({
  type: z.literal("DONE"),
  summary: z.string().min(1),
  items: z.array(extractedItemSchema).optional(),
});

export const agentActionSchema = z.discriminatedUnion("type", [
  clickActionSchema,
  typeActionSchema,
  scrollActionSchema,
  extractListActionSchema,
  doneActionSchema,
]);

export const llmDecisionSchema = z.object({
  stepSummary: z.string().min(1),
  nextIntent: z.string().min(1),
  expectedOutcome: z.string().min(1),
  action: agentActionSchema,
  done: z.boolean(),
});

export const planningResultSchema = z.object({
  plan: z.array(z.string().min(1)).min(2).max(5),
});

export const queryRefinementSchema = z.object({
  searchQuery: z.string().min(1),
  reason: z.string().min(1),
});

export const summaryResultSchema = z.object({
  summary: z.string().min(1),
});

export const toolResultSchema = z.object({
  success: z.boolean(),
  actionType: z.union([
    z.literal("CLICK"),
    z.literal("TYPE"),
    z.literal("SCROLL"),
    z.literal("EXTRACT_LIST"),
    z.literal("DONE"),
  ]),
  message: z.string().min(1),
  observation: z.record(z.string(), z.unknown()).optional(),
  items: z.array(extractedItemSchema).optional(),
  navigated: z.boolean().optional(),
  highlightedAgentId: z.string().optional(),
  errorCode: z.string().optional(),
});
