import { KNOWN_CATEGORY_KEYWORDS, RESEARCH_INTENT_KEYWORDS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type {
  CommerceTaskSpec,
  PublicResearchTaskSpec,
  SubtaskSpec,
  TaskPlan,
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

export function detectTaskType(goal: string): TaskType {
  if (hasResearchSignal(goal) && !hasCommerceCategory(goal)) {
    return "public_research";
  }

  if (hasBudgetSignal(goal) || hasCommerceCategory(goal) || /买|推荐|选购|商品|下单/.test(goal)) {
    return "commerce_search";
  }

  return "public_research";
}

export async function detectTaskTypeWithLiteModel(
  goal: string,
  options: {
    classifyWithLiteModel?: ClassifyTaskType;
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
      const taskType = detectTaskType(goal);
      return {
        taskType,
        reason: `lite model unavailable, fallback to rule-based routing: ${message}`,
        source: "rule",
      };
    }
  }

  const taskType = detectTaskType(goal);
  return {
    taskType,
    reason: "lite model unavailable, fallback to rule-based routing",
    source: "rule",
  };
}

function buildCommerceSubtasks(): SubtaskSpec[] {
  return [
    {
      id: "compile-commerce-task",
      type: "compile_task",
      goal: "识别购物目标并生成京东搜索词",
      allowedTools: ["compileTask"],
      successCriteria: ["得到稳定搜索词", "确定候选数量和提取限制"],
    },
    {
      id: "search-commerce-results",
      type: "search",
      goal: "打开京东搜索结果页",
      allowedTools: ["searchInSite"],
      successCriteria: ["当前页面进入京东搜索结果页"],
    },
    {
      id: "extract-commerce-results",
      type: "extract",
      goal: "提取结构化商品候选",
      allowedTools: ["extractStructuredResults"],
      successCriteria: ["提取到至少一个结构化商品"],
    },
    {
      id: "filter-commerce-results",
      type: "filter",
      goal: "过滤商品候选",
      allowedTools: ["filterCandidates"],
      successCriteria: ["保留足够的候选商品"],
    },
    {
      id: "aggregate-commerce-results",
      type: "aggregate",
      goal: "统一汇总最终推荐结果",
      allowedTools: ["aggregateTaskResults"],
      successCriteria: ["输出最终 Markdown"],
    },
  ];
}

function buildResearchSubtasks(): SubtaskSpec[] {
  return [
    {
      id: "compile-research-task",
      type: "compile_task",
      goal: "识别调研目标并生成 Google 查询词",
      allowedTools: ["compileTask"],
      successCriteria: ["得到稳定查询词", "确定候选来源数量"],
    },
    {
      id: "search-research-results",
      type: "search",
      goal: "打开 Google 搜索结果页",
      allowedTools: ["searchInSite"],
      successCriteria: ["进入 Google 第一页搜索结果"],
    },
    {
      id: "extract-research-results",
      type: "extract",
      goal: "提取 Google 第一页自然结果",
      allowedTools: ["extractStructuredResults"],
      successCriteria: ["提取到候选来源"],
    },
    {
      id: "filter-research-results",
      type: "filter",
      goal: "筛选前 5 个来源候选",
      allowedTools: ["filterCandidates"],
      successCriteria: ["得到不超过 5 个候选来源"],
    },
    {
      id: "read-research-results",
      type: "read_sources",
      goal: "串行读取来源页并提取事实",
      allowedTools: ["readPageFacts"],
      successCriteria: ["得到 3 个来源结果或候选耗尽"],
    },
    {
      id: "aggregate-research-results",
      type: "aggregate",
      goal: "统一汇总调研输出",
      allowedTools: ["aggregateTaskResults"],
      successCriteria: ["输出结论、来源概览和未解决问题"],
    },
  ];
}

export function buildTaskPlan(taskType: TaskType): TaskPlan {
  if (taskType === "commerce_search") {
    return {
      taskType,
      steps: ["解析任务并生成搜索词", "执行站内搜索", "提取搜索结果", "过滤候选商品", "统一汇总并输出结果"],
      subtasks: buildCommerceSubtasks(),
    };
  }

  return {
    taskType,
    steps: ["解析调研任务并生成查询词", "打开 Google 搜索结果页", "提取第一页自然结果", "筛选候选来源", "逐页读取来源并提取事实", "统一汇总并输出结果"],
    subtasks: buildResearchSubtasks(),
  };
}

export async function compileCommerceTask(
  goal: string,
  options: {
    refineWithLiteModel?: RefineSearchQuery;
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
  } = {},
): Promise<PublicResearchTaskSpec> {
  if (!options.refineWithLiteModel) {
    return {
      taskType: "public_research",
      originalGoal: goal,
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
  } = {},
): Promise<{
  taskType: TaskType;
  taskSpec: TaskSpec;
  taskPlan: TaskPlan;
}> {
  const taskType =
    options.taskType ??
    (
      await detectTaskTypeWithLiteModel(goal, {
        classifyWithLiteModel: options.classifyTaskTypeWithLiteModel,
      })
    ).taskType;

  if (taskType === "commerce_search") {
    const taskSpec = await compileCommerceTask(goal, {
      refineWithLiteModel: options.refineCommerceWithLiteModel,
    });
    return {
      taskType,
      taskSpec,
      taskPlan: buildTaskPlan(taskType),
    };
  }

  const taskSpec = await compilePublicResearchTask(goal, {
    refineWithLiteModel: options.refineResearchWithLiteModel,
  });
  return {
    taskType,
    taskSpec,
    taskPlan: buildTaskPlan(taskType),
  };
}
