import type { ExtractedItem, PublicResearchTaskSpec, ResearchSourceResult, SearchTaskSpec } from "../shared/types";

export function buildTaskRoutePrompt(goal: string) {
  return [
    "You classify browser-agent tasks.",
    "Return JSON only.",
    'Schema: {"taskType":"commerce_search|public_research","reason":"..."}',
    "Rules:",
    "- commerce_search is for shopping, product recommendation, budgeted product search, or clear purchase intent.",
    "- public_research is for explanations, comparisons, background research, summaries, and source-based investigation.",
    "- If the user asks for products to buy, recommend, compare by budget, or shortlist items, choose commerce_search.",
    "- If the user asks to research a topic, summarize sources, explain differences, or gather public information, choose public_research.",
    "- Choose exactly one taskType.",
    `User goal: ${goal}`,
  ].join("\n");
}

export function buildCommerceQueryRefinementPrompt(goal: string) {
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

export function buildResearchQueryRefinementPrompt(goal: string) {
  return [
    "You rewrite public web research queries for Google.",
    "Return JSON only.",
    'Schema: {"searchQuery":"...","reason":"..."}',
    "Rules:",
    "- Rewrite directly from the user goal.",
    "- Keep the query concise and information-seeking.",
    "- Prefer key entities, topic words, and comparison terms when present.",
    "- Do not add site filters unless the user explicitly asks for them.",
    "- Do not add words like recommendation, best, buy, price unless the goal clearly needs them.",
    "- Keep the query short enough for a normal Google search box.",
    `User goal: ${goal}`,
  ].join("\n");
}

export function buildCommerceSummaryPrompt(goal: string, taskSpec: SearchTaskSpec, items: ExtractedItem[]) {
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

export function buildResearchSummaryPrompt(
  goal: string,
  taskSpec: PublicResearchTaskSpec,
  sources: ResearchSourceResult[],
  unresolvedIssues: string[],
) {
  return [
    "You summarize public web research for a browser agent.",
    "Return JSON only.",
    'Schema: {"summary":"...","markdown":"..."}',
    "Rules:",
    "- Use only the structured source results provided.",
    "- Preserve uncertainty when a source is partial or blocked.",
    '- "markdown" must contain these sections in Chinese: 结论摘要, 来源要点, 来源链接, 未解决问题.',
    '- In 来源要点, keep each source concise and factual.',
    '- In 来源链接, list each source title and URL once.',
    "- If unresolved issues are empty, say 暂无.",
    `User goal: ${goal}`,
    `Task spec: ${JSON.stringify(taskSpec, null, 2)}`,
    `Sources: ${JSON.stringify(sources, null, 2)}`,
    `Unresolved issues: ${JSON.stringify(unresolvedIssues, null, 2)}`,
  ].join("\n");
}
