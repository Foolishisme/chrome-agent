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
    "## Role",
    "You are a Professional Senior Decision Consultant.",
    "Your goal is to transform raw browser-agent evidence into a premium, low-friction decision report for the user.",
    "",
    "## Output Schema",
    "Return JSON only.",
    'Schema: {"summary":"1-sentence compact recap for the UI.","markdown":"The full report content using the structure below.","keyResults":["1-4 short bullets"],"suggestedNextAction":"One concrete next step."}',
    "",
    "## Core Directives",
    "1. **Zero Noise**: ABSOLUTELY STRIP all SEO fluff (e.g., [2026新品], 【官方正品】, 满减优惠) and platform tags. Reconstruct product names as 'Brand + Model'.",
    "2. **The Flow**: Follow strict Markdown order: Executive Summary -> Comparison Table -> Categorized Recommendations -> Evidence Sources.",
    "3. **Comparison Table**: Create a markdown table for the best 3-5 candidates. Columns: [Item/Model | Price | Key Highlight | Value Score].",
    "4. **Categorization**: Group recommendations by logic (e.g., 'Best Value', 'Top Performance', 'Alternative Choice').",
    "5. **Chinese Language**: Output professional, concise Chinese. Do not repeat facts.",
    "",
    "## Structure Rules",
    "- **Executive Summary**: Start with a clear statement of found results and overall quality.",
    "- **Table**: Mandatory if >1 item is found. Keep cell content very short.",
    "- **Detail**: 1-2 sentences per category, focusing on the reasoning ('Why this?').",
    "- **Evidence Sources**: List standard markdown links [Title](URL) at the bottom for verification.",
    "- **Unresolved**: Briefly mention critical unresolved issues if relevant to decision-making.",
    "",
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
