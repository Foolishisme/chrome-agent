import type {
  ConversationTurn,
  DirectAnswerTaskSpec,
  ExtractedItem,
  PublicResearchTaskSpec,
  SearchPreference,
  SearchTaskSpec,
  SiteOverviewTaskSpec,
  SourceFactCard,
  TaskType,
} from "../../shared/agent-domain-model";

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
    'Schema: {"taskType":"direct_answer|commerce_search|public_research|site_overview","confidence":0.0,"decisionSignals":["..."],"reason":"..."}',
    `Current absolute time: ${options.currentTimeIso ?? new Date().toISOString()}`,
    `User timezone: ${options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"}`,
    `Search preference: ${options.searchPreference ?? "auto"}`,
    "Decision tree:",
    "1. If recent conversation already contains enough evidence for the user's follow-up, choose direct_answer.",
    "2. Else if the user asks to buy, recommend, compare by budget, shortlist products, or otherwise shows clear purchase intent, choose commerce_search.",
    "3. Else if the user gives a URL and asks to summarize or inspect that site, choose site_overview.",
    "4. Else if the user explicitly asks to inspect one official site/website/站点/官网, choose site_overview.",
    "5. Else if the user asks about a company's products, platform, docs, features, or pricing without a URL or explicit official-site wording, choose public_research.",
    "6. Else if the user asks for current, latest, recent, live, today, price, news, sourced, verified, reputation, reviews, market views, controversy, or third-party comparison, choose public_research.",
    "7. Else if search preference is prefer_search and the case is ambiguous, choose public_research.",
    "8. Else choose direct_answer for stable knowledge, explanations, and simple direct answers.",
    "Decision signals: use short machine-readable strings such as has_recent_evidence, purchase_intent, explicit_url, explicit_site_scope, company_info_without_site_scope, needs_current_info, needs_sources, third_party_view, prefer_search, stable_knowledge.",
    "Keep reason to one short sentence. Choose exactly one taskType.",
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

export function buildSiteCandidateReorderPrompt(options: {
  goal: string;
  targetDomain?: string;
  candidates: Array<{
    index: number;
    title: string;
    url: string;
    linkText?: string;
    linkLocation?: string;
    score?: number;
    rank: number;
  }>;
}) {
  return [
    "You reorder same-site navigation candidates for a browser agent.",
    "Return JSON only.",
    'Schema: {"orderedIndexes":[0,1,2],"reason":"..."}',
    "Rules:",
    "- Reorder only the provided candidates. Do not add or remove any candidate.",
    "- Prefer pages that help summarize the target site's official products, platform, docs, pricing, features, or core positioning for the user goal.",
    "- Prefer high-signal navigation pages over legal, account, social, careers, cookie, login, or shallow utility pages.",
    "- Keep the full set of indexes exactly once each.",
    "- Favor pages that are most useful to read first, not just pages with the shortest title.",
    `User goal: ${options.goal}`,
    `Target domain: ${options.targetDomain ?? "unknown"}`,
    `Candidates: ${JSON.stringify(options.candidates, null, 2)}`,
  ].join("\n");
}

export function buildFinalResultPrompt(options: {
  goal: string;
  taskType: TaskType;
  taskSpec: SearchTaskSpec | PublicResearchTaskSpec | SiteOverviewTaskSpec;
  items?: ExtractedItem[];
  sources?: Array<{
    title: string;
    url: string;
    status: string;
    textLength: number;
    unresolvedIssues: string[];
    sourceFactCard: SourceFactCard;
  }>;
  unresolvedIssues?: string[];
  conversationContext?: string;
}) {
  return [
    "Task: synthesize the provided structured evidence into the final user-facing answer.",
    "",
    "Output:",
    "Return JSON only.",
    'Schema: {"summary":"1-sentence UI recap","markdown":"final answer in markdown","keyResults":["1-4 short bullets"],"suggestedNextAction":"one concrete next step"}',
    "",
    "Hard rules:",
    "1. Write in concise Chinese.",
    "2. Answer the user's goal directly. Start markdown with the main conclusion.",
    "3. Use only provided items, sourceFactCards, unresolvedIssues, and relevant conversation context.",
    "4. Do not introduce external facts, assumptions, prices, claims, or links not present in the input.",
    "5. Attach source links to important factual claims. If evidence is insufficient, say so briefly.",
    "6. Include caveats only when they affect the answer.",
    "7. For site_overview, state pages read, failed/partial pages, and coverage limits.",
    "",
    "Style guidance:",
    "- Use a table only when it makes comparison easier.",
    "- Keep sections flexible and avoid source-by-source dumps.",
    "- Prefer grouped conclusions over repeating every fact.",
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

export function buildRoundDecisionPrompt(options: {
  goal: string;
  taskType: Exclude<TaskType, "direct_answer">;
  taskSpec: SearchTaskSpec | PublicResearchTaskSpec | SiteOverviewTaskSpec;
  roundIndex: number;
  maxRounds: number;
  currentFacts?: Record<string, unknown>;
  unresolvedIssues?: string[];
  candidates?: Array<{
    title: string;
    url: string;
    source?: string;
    rank: number;
  }>;
  sources?: Array<{
    title: string;
    url: string;
    status: string;
    textLength: number;
    unresolvedIssues: string[];
  }>;
  items?: Array<{
    title: string;
    url: string;
    priceText?: string;
    summary?: string;
  }>;
  filterDiagnostics?: unknown;
}) {
  return [
    "Task: decide whether the current browser-agent round should finalize, replan, or abort.",
    "",
    "Output:",
    "Return JSON only.",
    'Schema: {"decision":"finalize|replan|abort","reason":"one short sentence","nextRoundSummary":"optional short summary","taskSpecPatch":{"searchQuery":"optional","officialSearchQuery":"optional","entryUrl":"optional url","candidateLimit":1,"sourceTargetCount":1,"pageReadLimit":1,"topK":1,"llmInputLimit":1,"extractLimit":1,"notesAppend":["optional note"]}}',
    "",
    "Hard rules:",
    "1. Write reason and nextRoundSummary in concise Chinese.",
    "2. Choose finalize when the current evidence is already enough for a stable final answer.",
    "3. Choose replan only when another round is likely to materially improve quality.",
    "4. Choose abort when the task is blocked, has no meaningful progress, or another round is unlikely to help.",
    "5. Do not change the task type. taskSpecPatch may only adjust the current taskSpec within the same task type.",
    "6. Keep taskSpecPatch minimal. Omit fields that do not need to change.",
    "7. If roundIndex >= maxRounds, do not choose replan.",
    "8. Do not invent external facts or URLs that are not already present in the evidence, except rewriting searchQuery or officialSearchQuery.",
    "",
    `User goal: ${options.goal}`,
    `Task type: ${options.taskType}`,
    `Current round: ${options.roundIndex}`,
    `Max rounds: ${options.maxRounds}`,
    `Current taskSpec: ${JSON.stringify(options.taskSpec, null, 2)}`,
    `Current facts: ${JSON.stringify(options.currentFacts ?? {}, null, 2)}`,
    `Unresolved issues: ${JSON.stringify(options.unresolvedIssues ?? [], null, 2)}`,
    `Candidates: ${JSON.stringify(options.candidates ?? [], null, 2)}`,
    `Sources: ${JSON.stringify(options.sources ?? [], null, 2)}`,
    `Items: ${JSON.stringify(options.items ?? [], null, 2)}`,
    `Filter diagnostics: ${JSON.stringify(options.filterDiagnostics ?? null, null, 2)}`,
  ].join("\n");
}

export function buildDirectAnswerPrompt(options: {
  goal: string;
  taskSpec: DirectAnswerTaskSpec;
  conversationTurns?: ConversationTurn[];
}) {
  return [
    "Task: answer directly when browsing is unnecessary.",
    "",
    "Output:",
    "Return JSON only.",
    'Schema: {"summary":"1-sentence UI recap","markdown":"final answer in markdown","keyResults":["1-4 short bullets"],"suggestedNextAction":"one concrete next step"}',
    "",
    "Hard rules:",
    "1. Write in concise Chinese.",
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
