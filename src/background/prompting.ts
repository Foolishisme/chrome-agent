import type { ExtractedItem, SearchTaskSpec } from "../shared/types";

export function buildSearchQueryRefinementPrompt(goal: string, draftQuery: string) {
  return [
    "You rewrite short on-site e-commerce search queries.",
    "Return JSON only.",
    'Schema: {"searchQuery":"...","reason":"..."}',
    "Rules:",
    "- Keep the product category explicit.",
    "- Keep budget information when present.",
    "- Do not add recommendation reasons or ordering criteria.",
    `User goal: ${goal}`,
    `Draft query: ${draftQuery}`,
  ].join("\n");
}

export function buildFinalSummaryPrompt(goal: string, taskSpec: SearchTaskSpec, items: ExtractedItem[]) {
  return [
    "You summarize shopping candidates for a browser agent.",
    "Return JSON only.",
    'Schema: {"summary":"..."}',
    "Rules:",
    "- Use only the provided structured items.",
    "- Prioritize budget fit, price, and obvious selling points.",
    "- Keep the answer short and factual.",
    `User goal: ${goal}`,
    `Task spec: ${JSON.stringify(taskSpec, null, 2)}`,
    `Items: ${JSON.stringify(items, null, 2)}`,
  ].join("\n");
}
