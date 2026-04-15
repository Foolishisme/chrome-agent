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
  linkText: z.string().optional(),
  linkLocation: z.union([z.literal("header"), z.literal("nav"), z.literal("main"), z.literal("footer"), z.literal("unknown")]).optional(),
  score: z.number().optional(),
});

export const pageFactExtractionSchema = z.object({
  status: z.union([z.literal("success"), z.literal("partial")]),
  pageTitle: z.string(),
  bodyExcerpt: z.string(),
  textLength: z.number().int().nonnegative(),
  extractionStrategy: z.union([z.literal("readability"), z.literal("fallback")]).optional(),
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

export const recoverCloseDialogActionSchema = z.object({
  type: z.literal("RECOVER_CLOSE_DIALOG"),
});

export const extractListActionSchema = z.object({
  type: z.literal("EXTRACT_LIST"),
  limit: z.number().int().positive().optional(),
});

export const extractSearchResultsActionSchema = z.object({
  type: z.literal("EXTRACT_SEARCH_RESULTS"),
  limit: z.number().int().positive().optional(),
});

export const extractSiteNavLinksActionSchema = z.object({
  type: z.literal("EXTRACT_SITE_NAV_LINKS"),
  limit: z.number().int().positive().optional(),
  baseUrl: z.string().url().optional(),
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
  recoverCloseDialogActionSchema,
  extractListActionSchema,
  extractSearchResultsActionSchema,
  extractSiteNavLinksActionSchema,
  extractPageFactsActionSchema,
  doneActionSchema,
]);

export const queryRefinementSchema = z.object({
  searchQuery: z.string().min(1),
  reason: z.string().min(1),
});

export const taskRouteSchema = z.object({
  taskType: z.union([z.literal("direct_answer"), z.literal("commerce_search"), z.literal("public_research"), z.literal("site_overview")]),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  decisionSignals: z.array(z.string().min(1)).default([]),
});

export const nextToolSelectionSchema = z.object({
  toolName: z.union([
    z.literal("compileTaskSpec"),
    z.literal("finalizeDirectAnswer"),
    z.literal("resolveEntryPoint"),
    z.literal("openSearchResults"),
    z.literal("collectCommerceCandidates"),
    z.literal("collectResearchCandidates"),
    z.literal("readResearchSourceFacts"),
    z.literal("finalizeCommerceResult"),
    z.literal("finalizeResearchResult"),
  ]),
  reason: z.string().min(1),
});

export const researchCandidateReorderSchema = z.object({
  orderedIndexes: z.array(z.number().int().nonnegative()),
  reason: z.string().min(1).optional(),
});

export const finalResultSynthesisSchema = z.object({
  summary: z.string().min(1),
  markdown: z.string().min(1),
  keyResults: z.array(z.string()).default([]),
  suggestedNextAction: z.string().min(1),
});

export const actionResultSchema = z.object({
  success: z.boolean(),
  actionType: z.union([
    z.literal("CLICK"),
    z.literal("TYPE"),
    z.literal("NAVIGATE"),
    z.literal("SCROLL"),
    z.literal("RECOVER_CLOSE_DIALOG"),
    z.literal("EXTRACT_LIST"),
    z.literal("EXTRACT_SEARCH_RESULTS"),
    z.literal("EXTRACT_SITE_NAV_LINKS"),
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
  recoveryKind: z.literal("close_dialog").optional(),
  recoveryApplied: z.boolean().optional(),
  recoveryTarget: z.string().optional(),
  errorCode: z.string().optional(),
});
