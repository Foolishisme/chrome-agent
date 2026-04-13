import { KNOWN_CATEGORY_KEYWORDS, LIMITS, RESEARCH_INTENT_KEYWORDS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type {
  CommerceTaskSpec,
  ConversationTurn,
  DirectAnswerTaskSpec,
  OutputMode,
  PlanStep,
  PublicResearchTaskSpec,
  SearchPreference,
  SiteOverviewTaskSpec,
  TaskSpec,
  TaskType,
} from "../shared/types";

interface RefineSearchQuery {
  (goal: string): Promise<{ searchQuery: string; reason: string } | undefined>;
}

interface ClassifyTaskType {
  (goal: string): Promise<{ taskType: TaskType; reason: string } | undefined>;
}

function buildLlmInputLimit(topK: number) {
  return Math.max(10, topK);
}

function buildExtractLimit(llmInputLimit: number) {
  return Math.min(Math.max(12, llmInputLimit * 2), 24);
}

function extractTopK(goal: string) {
  const matched = goal.match(/(?:前|TOP|top)\s*(\d{1,2})/);
  if (matched) {
    return Math.max(1, Number(matched[1]));
  }

  const compareMatched = goal.match(/对比\s*(\d{1,2})\s*个/);
  if (compareMatched) {
    return Math.max(1, Number(compareMatched[1]));
  }

  return 5;
}

function hasBudgetSignal(goal: string) {
  return /\d+\s*(元|块|人民币|rmb)/i.test(goal) || /预算|价位|多少钱/.test(goal);
}

function hasCommerceCategory(goal: string) {
  const normalized = goal.toLowerCase();
  return KNOWN_CATEGORY_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function hasResearchSignal(goal: string) {
  return RESEARCH_INTENT_KEYWORDS.some((keyword) => goal.includes(keyword));
}

function extractExplicitUrl(goal: string) {
  const matched = goal.match(/https?:\/\/[^\s"'，。！？、；：)）]+/i);
  if (!matched) {
    return undefined;
  }

  try {
    return new URL(matched[0]).toString();
  } catch {
    return undefined;
  }
}

function hasSiteOverviewSignal(goal: string) {
  if (extractExplicitUrl(goal)) {
    return true;
  }

  return /官网|官方网站|官方站点|站点|网站|产品|平台|功能|文档|价格|pricing|docs|documentation|product|products|platform/i.test(goal);
}

function hasMultiSourceSignal(goal: string) {
  return /口碑|评价|评测|新闻|报道|竞品|对比|市场|观点|是否靠谱|靠谱吗|争议|舆情|用户反馈|第三方|媒体|news|review|compare|competitor/i.test(goal);
}

function hasFreshnessSignal(goal: string) {
  return /今天|今日|昨天|明天|现在|当前|目前|最近|最新|实时|本周|本月|今年|刚刚|现任|股价|价格|汇率|天气|比分|新闻|CEO|ceo|president/i.test(
    goal,
  );
}

function hasFollowUpSignal(goal: string) {
  return /刚才|上面|前面|继续|再说|再讲|展开|详细说|详细讲|补充|这个|那个|第一点|第二点|上一轮|刚刚提到/.test(goal);
}

function hasConversationEvidence(turns: ConversationTurn[] | undefined) {
  return (turns?.length ?? 0) > 0;
}

function hasStableKnowledgeSignal(goal: string) {
  return /是什么|什么意思|解释一下|解释下|讲讲|介绍一下|原理|概念|作用|区别|怎么理解|为何|为什么/.test(goal);
}

function resolveCurrentTimeIso(currentTimeIso?: string) {
  return currentTimeIso ?? new Date().toISOString();
}

function resolveTimezone(timezone?: string) {
  return timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
}

function buildFallbackResearchQuery(goal: string) {
  const normalized = goal
    .replace(/[，。！？、；：]/g, " ")
    .replace(/(?:进入前|前)\s*\d+\s*个?页面?/g, " ")
    .replace(/帮我|请|麻烦你|我想了解|我想知道|给我/g, " ")
    .replace(/调研一下|研究一下|总结一下|查一下|介绍一下|解释一下/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || goal.trim();
}

export function detectOutputMode(goal: string): OutputMode {
  const normalized = goal.trim();

  if (
    /(?:生成|输出|导出|写成|整理成|保存为|给我(?:一份)?|做成)(?:\S|\s){0,12}(?:报告|文档|markdown|md|文件)/i.test(normalized) ||
    /(?:报告|文档|markdown|md|文件)(?:\S|\s){0,8}(?:输出|生成|导出|整理)/i.test(normalized)
  ) {
    return "artifact";
  }

  return "inline";
}

export function detectTaskType(goal: string): TaskType {
  return detectTaskTypeWithContext(goal);
}

export function detectTaskTypeWithContext(
  goal: string,
  options: {
    conversationTurns?: ConversationTurn[];
    searchPreference?: SearchPreference;
  } = {},
): TaskType {
  if (hasMultiSourceSignal(goal) && !hasCommerceCategory(goal)) {
    return "public_research";
  }

  if (hasSiteOverviewSignal(goal) && !hasMultiSourceSignal(goal) && !hasCommerceCategory(goal)) {
    return "site_overview";
  }

  if (hasResearchSignal(goal) && !hasCommerceCategory(goal)) {
    return "public_research";
  }

  if (hasBudgetSignal(goal) || hasCommerceCategory(goal) || /买|推荐|选购|商品|下单/.test(goal)) {
    return "commerce_search";
  }

  if (hasFreshnessSignal(goal)) {
    return "public_research";
  }

  if (hasConversationEvidence(options.conversationTurns) && hasFollowUpSignal(goal)) {
    return "direct_answer";
  }

  if (hasStableKnowledgeSignal(goal)) {
    return "direct_answer";
  }

  if (options.searchPreference === "prefer_search") {
    return "public_research";
  }

  return "direct_answer";
}

export async function detectTaskTypeWithLiteModel(
  goal: string,
  options: {
    classifyWithLiteModel?: ClassifyTaskType;
    conversationTurns?: ConversationTurn[];
    searchPreference?: SearchPreference;
  } = {},
): Promise<{ taskType: TaskType; reason: string; source: "llm-lite" | "rule" }> {
  if (options.classifyWithLiteModel) {
    try {
      const classified = await options.classifyWithLiteModel(goal);
      if (classified?.taskType) {
        return {
          taskType: classified.taskType,
          reason: classified.reason,
          source: "llm-lite",
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "lite model routing failed";
      const taskType = detectTaskTypeWithContext(goal, {
        conversationTurns: options.conversationTurns,
        searchPreference: options.searchPreference,
      });
      return {
        taskType,
        reason: `lite model unavailable, fallback to rule-based routing: ${message}`,
        source: "rule",
      };
    }
  }

  const taskType = detectTaskTypeWithContext(goal, {
    conversationTurns: options.conversationTurns,
    searchPreference: options.searchPreference,
  });
  return {
    taskType,
    reason: "lite model unavailable, fallback to rule-based routing",
    source: "rule",
  };
}

export function buildPlanSteps(taskType: TaskType): PlanStep[] {
  if (taskType === "direct_answer") {
    return [
      {
        stepId: "compile-task-spec",
        goal: "判断当前问题是否可以直接回答并整理上下文",
        allowedTools: ["compileTaskSpec"],
        successCriteria: ["确定 direct_answer 路由", "整理当前时间和历史对话证据"],
        status: "pending",
      },
      {
        stepId: "finalize-direct-answer",
        goal: "直接生成最终回答",
        allowedTools: ["finalizeDirectAnswer"],
        successCriteria: ["输出结构化最终结果"],
        status: "pending",
      },
    ];
  }

  if (taskType === "commerce_search") {
    return [
      {
        stepId: "compile-task-spec",
        goal: "识别购物目标并生成京东搜索词",
        allowedTools: ["compileTaskSpec"],
        successCriteria: ["得到稳定搜索词", "确定候选数量和提取限制"],
        status: "pending",
      },
      {
        stepId: "open-search-results",
        goal: "打开京东搜索结果页",
        allowedTools: ["openSearchResults"],
        successCriteria: ["当前页面进入京东搜索结果页"],
        status: "pending",
      },
      {
        stepId: "collect-commerce-candidates",
        goal: "提取、过滤并收集商品候选",
        allowedTools: ["collectCommerceCandidates"],
        successCriteria: ["保留至少一个可用商品候选"],
        status: "pending",
      },
      {
        stepId: "finalize-commerce-result",
        goal: "统一汇总最终推荐结果",
        allowedTools: ["finalizeCommerceResult"],
        successCriteria: ["输出结构化最终结果"],
        status: "pending",
      },
    ];
  }

  if (taskType === "site_overview") {
    return [
      {
        stepId: "compile-task-spec",
        goal: "识别单站概况目标并整理站点入口信息",
        allowedTools: ["compileTaskSpec"],
        successCriteria: ["确定 site_overview 路由", "确定入口模式和读取预算"],
        status: "pending",
      },
      {
        stepId: "resolve-entry-point",
        goal: "解析并打开可信站点入口",
        allowedTools: ["resolveEntryPoint"],
        successCriteria: ["进入可信主页或确认入口受阻"],
        status: "pending",
      },
      {
        stepId: "collect-research-candidates",
        goal: "从主页导航中筛选高价值次页候选",
        allowedTools: ["collectResearchCandidates"],
        successCriteria: ["得到主页和一跳高价值候选列表"],
        status: "pending",
      },
      {
        stepId: "read-research-source-facts",
        goal: "读取主页与高价值次页正文",
        allowedTools: ["readResearchSourceFacts"],
        successCriteria: ["读到主页与目标数量次页，或确认候选耗尽"],
        status: "pending",
      },
      {
        stepId: "finalize-research-result",
        goal: "统一汇总站点概况和覆盖边界",
        allowedTools: ["finalizeResearchResult"],
        successCriteria: ["输出站点概况、来源和未覆盖区域"],
        status: "pending",
      },
    ];
  }

  return [
    {
      stepId: "compile-task-spec",
      goal: "识别调研目标并生成 Google 查询词",
      allowedTools: ["compileTaskSpec"],
      successCriteria: ["得到稳定查询词", "确定候选来源数量"],
      status: "pending",
    },
    {
      stepId: "open-search-results",
      goal: "打开 Google 搜索结果页",
      allowedTools: ["openSearchResults"],
      successCriteria: ["进入 Google 第一页搜索结果"],
      status: "pending",
    },
    {
      stepId: "collect-research-candidates",
      goal: "提取并筛选来源候选",
      allowedTools: ["collectResearchCandidates"],
      successCriteria: ["得到可读取的来源候选列表"],
      status: "pending",
    },
    {
      stepId: "read-research-source-facts",
      goal: "串行读取来源页并提取事实",
      allowedTools: ["readResearchSourceFacts"],
      successCriteria: ["得到目标来源数或确认候选耗尽"],
      status: "pending",
    },
    {
      stepId: "finalize-research-result",
      goal: "统一汇总调研输出",
      allowedTools: ["finalizeResearchResult"],
      successCriteria: ["输出结论、来源概览和未解决问题"],
      status: "pending",
    },
  ];
}

function normalizeDomainFromUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function extractSiteName(goal: string) {
  const withoutUrl = goal.replace(/https?:\/\/[^\s"'，。！？、；：)）]+/gi, " ");
  const matched =
    withoutUrl.match(/(?:看一下|了解一下|介绍一下|调研一下|研究一下)?\s*([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})\s*(?:的)?(?:官网|产品|平台|功能|文档|价格|pricing|docs|product|products|platform)/i) ??
    withoutUrl.match(/([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})/);
  return matched?.[1]?.trim().replace(/\s+/g, " ");
}

export function compileSiteOverviewTask(goal: string): SiteOverviewTaskSpec {
  const entryUrl = extractExplicitUrl(goal);
  const siteName = normalizeDomainFromUrl(entryUrl) ?? extractSiteName(goal);
  const officialSearchQuery = siteName ? `${siteName} official website` : buildFallbackResearchQuery(goal);

  return {
    taskType: "site_overview",
    originalGoal: goal,
    outputMode: detectOutputMode(goal),
    entryMode: entryUrl ? "explicit_url" : "resolve_official_home",
    entryUrl,
    siteName,
    targetDomain: normalizeDomainFromUrl(entryUrl),
    officialSearchQuery,
    candidateLimit: 6,
    sourceTargetCount: 3,
    pageReadLimit: 5,
    maxLinkDepth: 1,
    minReadableTextLength: LIMITS.PAGE_TEXT_MIN_LENGTH,
    notes: [entryUrl ? "用户提供明确 URL，优先直达站点入口" : "用户未提供 URL，需有界解析官网入口"],
  };
}

export function compileDirectAnswerTask(
  goal: string,
  options: {
    routeReason?: string;
    currentTimeIso?: string;
    timezone?: string;
    conversationTurns?: ConversationTurn[];
  } = {},
): DirectAnswerTaskSpec {
  const evidenceTurns = options.conversationTurns?.slice(-3) ?? [];

  return {
    taskType: "direct_answer",
    originalGoal: goal,
    outputMode: detectOutputMode(goal),
    routeReason:
      options.routeReason ??
      (evidenceTurns.length > 0 ? "recent conversation already contains enough context for a direct answer" : "the goal looks like stable knowledge or a simple direct answer request"),
    currentTimeIso: resolveCurrentTimeIso(options.currentTimeIso),
    timezone: resolveTimezone(options.timezone),
    evidenceTurnCount: evidenceTurns.length,
  };
}

export async function compileCommerceTask(
  goal: string,
  options: {
    refineWithLiteModel?: RefineSearchQuery;
    conversationContext?: string;
  } = {},
): Promise<CommerceTaskSpec> {
  const topK = extractTopK(goal);
  const llmInputLimit = buildLlmInputLimit(topK);
  const extractLimit = buildExtractLimit(llmInputLimit);
  if (!options.refineWithLiteModel) {
    throw new RuntimeError("Search query planning requires the lite model.", "SEARCH_QUERY_PLANNER_MISSING");
  }

  const refined = await options.refineWithLiteModel(goal);
  const searchQuery = refined?.searchQuery?.trim();
  if (!searchQuery) {
    throw new RuntimeError("The lite model did not return a usable search query.", "SEARCH_QUERY_EMPTY");
  }

  return {
    taskType: "commerce_search",
    originalGoal: goal,
    outputMode: detectOutputMode(goal),
    topK,
    llmInputLimit,
    extractLimit,
    searchQuery,
    querySource: "llm-lite",
    notes: [refined?.reason ?? "小模型生成搜索词"],
  };
}

export const compileSearchTask = compileCommerceTask;

export async function compilePublicResearchTask(
  goal: string,
  options: {
    refineWithLiteModel?: RefineSearchQuery;
    conversationContext?: string;
  } = {},
): Promise<PublicResearchTaskSpec> {
  if (!options.refineWithLiteModel) {
    return {
      taskType: "public_research",
      originalGoal: goal,
      outputMode: detectOutputMode(goal),
      searchQuery: buildFallbackResearchQuery(goal),
      querySource: "rule",
      notes: ["小模型不可用，回退到规则生成 Google 查询词"],
      searchEngine: "google",
      candidateLimit: 5,
      sourceTargetCount: 3,
    };
  }

  try {
    const refined = await options.refineWithLiteModel(goal);
    const searchQuery = refined?.searchQuery?.trim();
    if (!searchQuery) {
      throw new RuntimeError("The lite model did not return a usable research query.", "RESEARCH_QUERY_EMPTY");
    }

    return {
      taskType: "public_research",
      originalGoal: goal,
      outputMode: detectOutputMode(goal),
      searchQuery,
      querySource: "llm-lite",
      notes: [refined?.reason ?? "小模型生成 Google 查询词"],
      searchEngine: "google",
      candidateLimit: 5,
      sourceTargetCount: 3,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "小模型生成查询词失败";
    return {
      taskType: "public_research",
      originalGoal: goal,
      outputMode: detectOutputMode(goal),
      searchQuery: buildFallbackResearchQuery(goal),
      querySource: "rule",
      notes: [`小模型不可用，回退到规则生成 Google 查询词：${message}`],
      searchEngine: "google",
      candidateLimit: 5,
      sourceTargetCount: 3,
    };
  }
}

export async function compileTaskSpec(
  goal: string,
  options: {
    taskType?: TaskType;
    classifyTaskTypeWithLiteModel?: ClassifyTaskType;
    refineCommerceWithLiteModel?: RefineSearchQuery;
    refineResearchWithLiteModel?: RefineSearchQuery;
    conversationContext?: string;
    conversationTurns?: ConversationTurn[];
    routeReason?: string;
    currentTimeIso?: string;
    timezone?: string;
    searchPreference?: SearchPreference;
  } = {},
): Promise<{
  taskType: TaskType;
  taskSpec: TaskSpec;
  plan: PlanStep[];
}> {
  const taskType =
    options.taskType ??
    (
      await detectTaskTypeWithLiteModel(goal, {
        classifyWithLiteModel: async (routeGoal) =>
          options.classifyTaskTypeWithLiteModel?.(routeGoal),
        conversationTurns: options.conversationTurns,
        searchPreference: options.searchPreference,
      })
    ).taskType;

  if (taskType === "direct_answer") {
    const taskSpec = compileDirectAnswerTask(goal, {
      routeReason: options.routeReason,
      currentTimeIso: options.currentTimeIso,
      timezone: options.timezone,
      conversationTurns: options.conversationTurns,
    });
    return {
      taskType,
      taskSpec,
      plan: buildPlanSteps(taskType),
    };
  }

  if (taskType === "commerce_search") {
    const taskSpec = await compileCommerceTask(goal, {
      refineWithLiteModel: options.refineCommerceWithLiteModel,
    });
    return {
      taskType,
      taskSpec,
      plan: buildPlanSteps(taskType),
    };
  }

  if (taskType === "site_overview") {
    const taskSpec = compileSiteOverviewTask(goal);
    return {
      taskType,
      taskSpec,
      plan: buildPlanSteps(taskType),
    };
  }

  const taskSpec = await compilePublicResearchTask(goal, {
    refineWithLiteModel: options.refineResearchWithLiteModel,
  });
  return {
    taskType,
    taskSpec,
    plan: buildPlanSteps(taskType),
  };
}
