import type {
  ConversationTurn,
  DirectAnswerTaskSpec,
  ExtractedItem,
  PlanStep,
  PublicResearchTaskSpec,
  ResearchSourceResult,
  SearchPreference,
  SearchTaskSpec,
  TaskType,
} from "../shared/types";

export function buildTaskRoutePrompt(goal: string) {
  return buildTaskRoutePromptWithContext(goal);
}

function formatConversationTurns(turns: ConversationTurn[] | undefined) {
  const recentTurns = turns?.slice(-3) ?? [];
  if (recentTurns.length === 0) {
    return "[]";
  }

  return JSON.stringify(
    recentTurns.map((turn) => ({
      turnId: turn.turnId,
      savedAt: new Date(turn.savedAt).toISOString(),
      userGoal: turn.goal,
      assistantSummary: turn.answerSummary,
    })),
    null,
    2,
  );
}

export function buildTaskRoutePromptWithContext(
  goal: string,
  options: {
    conversationContext?: string;
    conversationTurns?: ConversationTurn[];
    currentTimeIso?: string;
    timezone?: string;
    searchPreference?: SearchPreference;
  } = {},
) {
  return [
    "You classify browser-agent tasks.",
    "Return JSON only.",
    'Schema: {"taskType":"direct_answer|commerce_search|public_research","reason":"..."}',
    `Current absolute time: ${options.currentTimeIso ?? new Date().toISOString()}`,
    `User timezone: ${options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"}`,
    `Search preference: ${options.searchPreference ?? "auto"}`,
    "Rules:",
    "- commerce_search is for shopping, product recommendation, budgeted product search, or clear purchase intent.",
    "- public_research is for web-search tasks, source-based investigation, or questions that likely depend on current external facts.",
    "- direct_answer is for simple stable knowledge, explanations, or follow-up questions that can be answered from recent conversation evidence without opening search pages.",
    "- If recent conversation already contains enough evidence for the user's follow-up, choose direct_answer.",
    "- If the user explicitly asks for current, latest, recent, live, today, price, news, official, sourced, or time-sensitive facts, choose public_research.",
    "- If search preference is prefer_search and the case is ambiguous, prefer public_research.",
    "- Even when search preference is prefer_search, keep direct_answer for clearly stable knowledge or clearly sufficient recent conversation evidence.",
    "- If the user asks for products to buy, recommend, compare by budget, or shortlist items, choose commerce_search.",
    "- If the user asks to research a topic, gather sources, verify facts, or search public information, choose public_research.",
    "- Choose exactly one taskType.",
    `Recent conversation turns: ${formatConversationTurns(options.conversationTurns)}`,
    ...(options.conversationContext ? [`Recent conversation context:\n${options.conversationContext}`] : []),
    `User goal: ${goal}`,
  ].join("\n");
}

export function buildCommerceQueryRefinementPrompt(goal: string, conversationContext?: string) {
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
    ...(conversationContext ? [`Recent conversation context:\n${conversationContext}`] : []),
    `User goal: ${goal}`,
  ].join("\n");
}

export function buildResearchQueryRefinementPrompt(goal: string, conversationContext?: string) {
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
    ...(conversationContext ? [`Recent conversation context:\n${conversationContext}`] : []),
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

export function buildResearchCandidateReorderPrompt(options: {
  goal: string;
  searchQuery: string;
  candidates: Array<{
    index: number;
    title: string;
    url: string;
    source?: string;
    snippet?: string;
    rank: number;
  }>;
}) {
  return [
    "You reorder first-page public web research candidates for a browser agent.",
    "Return JSON only.",
    'Schema: {"orderedIndexes":[0,1,2],"reason":"..."}',
    "Rules:",
    "- Reorder only the provided candidates. Do not add or remove any candidate.",
    "- Prefer candidates that are more likely to be primary, credible, directly relevant, and information-dense.",
    "- Prefer official sites, established media, institutions, papers, and high-signal explainers over generic aggregators or marketing pages.",
    "- Keep the full set of indexes exactly once each.",
    "- Favor candidates that are most useful to read first, not just most famous domains.",
    `User goal: ${options.goal}`,
    `Search query: ${options.searchQuery}`,
    `Candidates: ${JSON.stringify(options.candidates, null, 2)}`,
  ].join("\n");
}

export function buildFinalResultPrompt(options: {
  goal: string;
  taskType: TaskType;
  taskSpec: SearchTaskSpec | PublicResearchTaskSpec;
  items?: ExtractedItem[];
  sources?: ResearchSourceResult[];
  unresolvedIssues?: string[];
  conversationContext?: string;
}) {
  return [
    "## Role",
    "You are a professional decision-writing assistant.",
    "Transform raw browser-agent evidence into a concise, decision-useful final answer for the user.",
    "",
    "## Output Schema",
    "Return JSON only.",
    'Schema: {"summary":"1-sentence compact recap for the UI.","markdown":"The full report content using the structure below.","keyResults":["1-4 short bullets"],"suggestedNextAction":"One concrete next step."}',
    "",
    "## Hard Rules",
    "1. Output professional, concise Chinese.",
    "2. Start with a short overall conclusion or executive summary.",
    "3. If there are multiple candidates / options / sources worth comparing, prefer a markdown table early in the answer.",
    "4. The final section MUST be information sources, using standard markdown links [Title](URL).",
    "5. Remove SEO fluff, platform marketing words, and repetitive noise.",
    "",
    "## Writing Guidance",
    "- Do NOT force a rigid template when the material does not support it.",
    "- Prefer a total-then-breakdown structure: short conclusion first, then comparison or breakdown, then sources.",
    "- If a table is used, keep cells short and decision-oriented.",
    "- You may add sections such as recommendations, comparison, caveats, or open issues only when they help.",
    "- Mention critical unresolved issues only when they affect the user's decision.",
    "- Treat research source bodyExcerpt as the primary evidence body, and do not assume source summaries already exist.",
    "",
    ...(options.conversationContext ? [`Recent conversation context:\n${options.conversationContext}`, ""] : []),
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

export function buildDirectAnswerPrompt(options: {
  goal: string;
  taskSpec: DirectAnswerTaskSpec;
  conversationTurns?: ConversationTurn[];
}) {
  return [
    "## Role",
    "You are a concise assistant that answers directly when browsing is unnecessary.",
    "",
    "## Output Schema",
    "Return JSON only.",
    'Schema: {"summary":"1-sentence compact recap for the UI.","markdown":"The full direct answer in markdown.","keyResults":["1-4 short bullets"],"suggestedNextAction":"One concrete next step."}',
    "",
    "## Hard Rules",
    "1. Output professional, concise Chinese.",
    "2. Answer the user's current question directly instead of describing agent workflow.",
    "3. Use recent conversation evidence when it is relevant, but do not restate long chat history.",
    "4. Do not invent fresh external facts, citations, or links that are not present in the provided context.",
    "5. If the evidence is incomplete, answer only the stable part and state the uncertainty briefly.",
    "",
    `Current absolute time: ${options.taskSpec.currentTimeIso}`,
    `User timezone: ${options.taskSpec.timezone}`,
    `Route reason: ${options.taskSpec.routeReason}`,
    `Recent conversation turns: ${formatConversationTurns(options.conversationTurns)}`,
    `User goal: ${options.goal}`,
  ].join("\n");
}
