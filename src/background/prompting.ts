import type { ExtractedItem, SearchTaskSpec } from "../shared/types";

export function buildSearchQueryRefinementPrompt(goal: string) {
  return [
    "You rewrite JD.com on-site shopping queries.",
    "Return JSON only.",
    'Schema: {"searchQuery":"...","reason":"..."}',
    "One-shot examples:",
    'User goal: 3000 笔记本',
    'Output: {"searchQuery":"轻薄本 3000元","reason":"“笔记本”过宽，收敛到 3000 元预算下更常见的京东搜索词"}',
    'User goal: 学生用苹果电脑写论文',
    'Output: {"searchQuery":"MacBook 学生 办公","reason":"保留品牌并补上学生办公场景"}',
    'User goal: 5000 游戏电脑',
    'Output: {"searchQuery":"游戏本 5000元","reason":"把宽泛的“游戏电脑”收敛成更适合京东站内搜索的商品词"}',
    "Rules:",
    "- Rewrite directly from the user goal. Do not depend on a rule-generated draft query.",
    "- Keep the product category explicit.",
    "- Keep price or budget information when present, and normalize money to the form like 3000元 when helpful.",
    "- When the user goal is broad, narrow it to a more search-friendly product phrase for JD.com.",
    "- Prefer scene, form factor, target user, or brand only when they are clearly implied by the goal.",
    "- Do not add recommendation reasons, sorting criteria, or marketing wording.",
    "- Keep the query short enough for an on-site search box.",
    `User goal: ${goal}`,
  ].join("\n");
}

export function buildFinalSummaryPrompt(goal: string, taskSpec: SearchTaskSpec, items: ExtractedItem[]) {
  return [
    "You summarize shopping candidates for a browser agent.",
    "Return JSON only.",
    'Schema: {"summary":"...","markdown":"..."}',
    "Rules:",
    "- Use only the provided structured items.",
    "- Select the most relevant items for the user goal instead of listing every candidate.",
    `- The user asked for ${taskSpec.topK} final recommendations. You may return fewer only if the candidates are clearly weak.`,
    `- You are given up to ${taskSpec.llmInputLimit} structured candidates after code-side filtering.`,
    "- Prioritize budget fit, price, and obvious selling points.",
    "- Keep the wording short and factual.",
    '- "markdown" must be a readable final answer with short sections and selected items.',
    '- "summary" must be a one-paragraph compact recap.',
    `User goal: ${goal}`,
    `Task spec: ${JSON.stringify(taskSpec, null, 2)}`,
    `Items: ${JSON.stringify(items, null, 2)}`,
  ].join("\n");
}
