import { z } from "zod";

export const extractedItemSchema = z.object({
  title: z.string().min(1),
  priceText: z.string().min(1),
  url: z.string().min(1),
  shopText: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

export const researchCandidateSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  snippet: z.string().optional(),
  source: z.string().optional(),
  displayUrl: z.string().optional(),
  rank: z.number().int().positive(),
  isAd: z.boolean().optional(),
});

export const pageFactExtractionSchema = z.object({
  status: z.union([z.literal("success"), z.literal("partial")]),
  pageTitle: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  textLength: z.number().int().nonnegative(),
  reason: z.string().optional(),
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

export const navigateActionSchema = z.object({
  type: z.literal("NAVIGATE"),
  url: z.string().url(),
});

export const scrollActionSchema = z.object({
  type: z.literal("SCROLL"),
  direction: z.union([z.literal("up"), z.literal("down")]),
  amount: z.number().positive().optional(),
});

export const extractListActionSchema = z.object({
  type: z.literal("EXTRACT_LIST"),
  limit: z.number().int().positive().optional(),
});

export const extractSearchResultsActionSchema = z.object({
  type: z.literal("EXTRACT_SEARCH_RESULTS"),
  limit: z.number().int().positive().optional(),
});

export const extractPageFactsActionSchema = z.object({
  type: z.literal("EXTRACT_PAGE_FACTS"),
});

export const doneActionSchema = z.object({
  type: z.literal("DONE"),
  summary: z.string().min(1),
  items: z.array(extractedItemSchema).optional(),
});

export const agentActionSchema = z.discriminatedUnion("type", [
  clickActionSchema,
  typeActionSchema,
  navigateActionSchema,
  scrollActionSchema,
  extractListActionSchema,
  extractSearchResultsActionSchema,
  extractPageFactsActionSchema,
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
  plan: z.array(z.string().min(1)).min(2).max(8),
});

export const queryRefinementSchema = z.object({
  searchQuery: z.string().min(1),
  reason: z.string().min(1),
});

export const taskRouteSchema = z.object({
  taskType: z.union([z.literal("commerce_search"), z.literal("public_research")]),
  reason: z.string().min(1),
});

export const summaryResultSchema = z.object({
  summary: z.string().min(1),
  markdown: z.string().min(1),
});

export const actionResultSchema = z.object({
  success: z.boolean(),
  actionType: z.union([
    z.literal("CLICK"),
    z.literal("TYPE"),
    z.literal("NAVIGATE"),
    z.literal("SCROLL"),
    z.literal("EXTRACT_LIST"),
    z.literal("EXTRACT_SEARCH_RESULTS"),
    z.literal("EXTRACT_PAGE_FACTS"),
    z.literal("DONE"),
  ]),
  message: z.string().min(1),
  observation: z.record(z.string(), z.unknown()).optional(),
  items: z.array(extractedItemSchema).optional(),
  researchCandidates: z.array(researchCandidateSchema).optional(),
  pageFactsResult: pageFactExtractionSchema.optional(),
  navigated: z.boolean().optional(),
  highlightedAgentId: z.string().optional(),
  errorCode: z.string().optional(),
});
