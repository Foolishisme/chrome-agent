import type {
  ExtractedItem,
  PlanStep,
  PublicResearchTaskSpec,
  ResearchSourceResult,
  SearchTaskSpec,
  TaskType,
} from "../shared/types";

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
    'User goal: 3000 元以内轻薄本',
    'Output: {"searchQuery":"轻薄本 3000元","reason":"保留预算并收敛到更适合京东站内搜索的商品词"}',
    'User goal: 学生用苹果电脑写论文',
    'Output: {"searchQuery":"MacBook 学生 办公","reason":"保留品牌并补充明确场景"}',
    'User goal: 5000 游戏电脑',
    'Output: {"searchQuery":"游戏本 5000元","reason":"把宽泛需求改写成更适合商品检索的短词"}',
    "Rules:",
    "- Rewrite directly from the user goal. Do not depend on a rule-generated draft query.",
    "- Keep the product category explicit.",
    "- Keep price or budget information when present.",
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

export function buildNextToolPrompt(options: {
  goal: string;
  taskType: TaskType;
  currentStep: PlanStep;
  budgetLow?: boolean;
  currentFacts?: Record<string, unknown>;
  unresolvedIssues?: string[];
}) {
  return [
    "You choose the next high-level tool for a browser agent.",
    "Return JSON only.",
    'Schema: {"toolName":"...","reason":"..."}',
    "Rules:",
    "- Choose exactly one tool from allowedTools.",
    "- Do not invent a tool name outside allowedTools.",
    "- Prefer the tool that most directly advances the current plan step.",
    "- If budgetLow is true, prefer the tool that helps the task converge safely.",
    "- Do not mention raw DOM actions, selectors, or waits.",
    `User goal: ${options.goal}`,
    `Task type: ${options.taskType}`,
    `Current step: ${JSON.stringify(options.currentStep, null, 2)}`,
    `Budget low: ${options.budgetLow ? "true" : "false"}`,
    `Known facts: ${JSON.stringify(options.currentFacts ?? {}, null, 2)}`,
    `Unresolved issues: ${JSON.stringify(options.unresolvedIssues ?? [], null, 2)}`,
  ].join("\n");
}

export function buildFinalResultPrompt(options: {
  goal: string;
  taskType: TaskType;
  taskSpec: SearchTaskSpec | PublicResearchTaskSpec;
  items?: ExtractedItem[];
  sources?: ResearchSourceResult[];
  unresolvedIssues?: string[];
}) {
  return [
    "You synthesize the final browser-agent answer from structured evidence.",
    "Return JSON only.",
    'Schema: {"summary":"...","markdown":"..."}',
    "One-shot examples:",
    'Input: {"goal":"推荐 3000 元以内的轻薄本","taskType":"commerce_search","items":[{"title":"A","priceText":"2999","url":"https://example.com/a","summary":"轻薄，日常办公"}],"sources":[],"unresolvedIssues":[]}',
    'Output: {"summary":"已基于结构化候选整理出预算内建议。","markdown":"## 推荐结论\\n预算内已有可选项，优先看便携性和日常办公体验。\\n\\n## 推荐项\\n- [A](https://example.com/a) | 2999 | 轻薄，日常办公"}',
    'Input: {"goal":"调研 Playwright 和 Selenium 的区别","taskType":"public_research","items":[],"sources":[{"pageTitle":"Playwright docs","sourceUrl":"https://example.com/p","summary":"更偏现代 Web 自动化","keyPoints":["自动等待"],"status":"success","unresolvedIssues":[]}],"unresolvedIssues":["部分来源不可读"]}',
    'Output: {"summary":"已基于可读来源整理出核心差异，并保留未解决问题。","markdown":"## 结论\\nPlaywright 更偏现代 Web 自动化能力。\\n\\n## 依据\\n- Playwright docs: 更偏现代 Web 自动化\\n\\n## 未解决问题\\n- 部分来源不可读"}',
    "Rules:",
    "- Use only the provided structured evidence. Do not invent facts.",
    "- Produce a concise Chinese final answer.",
    '- "summary" must be a compact recap for the UI.',
    '- "markdown" must be a readable final answer for the result panel.',
    "- Use sections only when they help. Do not force a fixed template.",
    "- When item candidates are present, shortlist only the strongest ones.",
    "- When source results are present, preserve uncertainty and mention unresolved issues when relevant.",
    "- Do not mention runtime internals, tools, selectors, or execution details.",
    `Input: ${JSON.stringify(
      {
        goal: options.goal,
        taskType: options.taskType,
        taskSpec: options.taskSpec,
        items: options.items ?? [],
        sources: options.sources ?? [],
        unresolvedIssues: options.unresolvedIssues ?? [],
      },
      null,
      2,
    )}`,
  ].join("\n");
}
