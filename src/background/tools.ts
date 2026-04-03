import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type {
  ActionResult,
  AgentAction,
  AgentPhase,
  CommerceTaskSpec,
  DebugLogEntry,
  DebugLogLevel,
  ExtractedItem,
  PublicResearchTaskSpec,
  ResearchSourceResult,
  SessionMemory,
  SnapshotData,
  TaskSpec,
  ToolName,
  ToolResult,
} from "../shared/types";
import { compileTaskSpec } from "./query-compiler";
import {
  generateCommerceSummary,
  generateResearchSummary,
  refineCommerceSearchQuery,
  refineResearchQuery,
} from "./llm-client";
import { filterExtractedItems, filterResearchCandidates } from "./result-filter";

type StepOptions = {
  stepSummary: string;
  nextIntent?: string;
  expectedOutcome?: string;
  action?: AgentAction;
  actionResult?: ActionResult;
  snapshot?: SnapshotData;
  snapshotSummary?: string;
};

export interface ToolExecutionContext {
  memory: SessionMemory;
  signal: AbortSignal;
  scanPage(): Promise<SnapshotData>;
  ensureUsableSnapshot(): Promise<SnapshotData>;
  executeAction(action: AgentAction, stepSummary: string): Promise<ActionResult>;
  settleAfterAction(action: AgentAction): Promise<void>;
  appendLog(source: DebugLogEntry["source"], level: DebugLogLevel, message: string, detail?: unknown): void;
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface AgentToolDefinition {
  name: ToolName;
  run(context: ToolExecutionContext): Promise<ToolResult>;
}

function normalizeText(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function getSearchPageSignals(snapshot: SnapshotData) {
  const signals = [snapshot.pageFacts.searchBox.text, snapshot.title];

  try {
    const parsed = new URL(snapshot.url);
    signals.push(parsed.searchParams.get("keyword") ?? undefined);
    signals.push(parsed.searchParams.get("q") ?? undefined);
  } catch {
    // Ignore malformed URLs and keep the existing signals.
  }

  return signals.filter((signal): signal is string => !!signal && signal.trim().length > 0);
}

function hasMatchingQuery(snapshot: SnapshotData, searchQuery: string) {
  const normalizedQuery = normalizeText(searchQuery);
  if (!normalizedQuery) {
    return false;
  }

  const queryTokens = searchQuery
    .split(/\s+/)
    .map((token) => normalizeText(token))
    .filter((token) => token.length >= 2);

  return getSearchPageSignals(snapshot).some((signal) => {
    const normalizedSignal = normalizeText(signal);
    return (
      normalizedSignal.includes(normalizedQuery) ||
      (queryTokens.length > 0 && queryTokens.every((token) => normalizedSignal.includes(token)))
    );
  });
}

function buildSearchUrl(taskSpec: TaskSpec) {
  if (taskSpec.taskType === "commerce_search") {
    const url = new URL("https://search.jd.com/Search");
    url.searchParams.set("keyword", taskSpec.searchQuery);
    url.searchParams.set("enc", "utf-8");
    return url.toString();
  }

  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", taskSpec.searchQuery);
  url.searchParams.set("hl", "zh-CN");
  return url.toString();
}

function detectSearchBlocker(taskType: TaskSpec["taskType"], snapshot: SnapshotData) {
  try {
    const parsed = new URL(snapshot.url);

    if (
      taskType === "commerce_search" &&
      (parsed.hostname === "passport.jd.com" || parsed.hostname === "plogin.m.jd.com" || parsed.pathname.includes("/new/login"))
    ) {
      return "JD redirected the search to a login page.";
    }

    if (taskType === "public_research" && parsed.hostname.endsWith("google.com") && parsed.pathname.startsWith("/sorry")) {
      return "Google returned a verification page and blocked the search results.";
    }
  } catch {
    // Ignore malformed URLs and keep runtime behavior unchanged.
  }

  return undefined;
}

export function buildRuleBasedSummary(goal: string, items: ExtractedItem[]) {
  const first = items[0];
  if (!first) {
    return `Completed the rule-based search for "${goal}", but not enough usable items were collected.`;
  }

  const highlights = items
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title} (${item.priceText}${item.shopText ? `, ${item.shopText}` : ""})`)
    .join("; ");

  return `Completed the rule-based search for "${goal}" and kept ${items.length} candidates. Top picks: ${highlights}.`;
}

function buildCommerceFinalMarkdown(goal: string, items: ExtractedItem[], summary: string) {
  const lines = [
    "## Goal",
    goal,
    "",
    "## Recommendations",
    ...items.map((item, index) => {
      const parts = [`${index + 1}. [${item.title}](${item.url})`, `price: ${item.priceText}`];
      if (item.shopText) {
        parts.push(`shop: ${item.shopText}`);
      }
      if (item.summary) {
        parts.push(`note: ${item.summary}`);
      }
      return `- ${parts.join(" | ")}`;
    }),
    "",
    "## Summary",
    summary,
  ];

  return lines.join("\n");
}

function buildResearchFallbackSummary(goal: string, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  if (countSuccessfulResearchSources(sources) === 0) {
    return `目前没有可靠的信息来源，无法对“${goal}”形成可信结论。`;
  }

  const titles = sources.slice(0, 3).map((source) => source.pageTitle || source.candidate.title).join("、");
  if (unresolvedIssues.length > 0) {
    return `已基于 ${sources.length} 个来源完成“${goal}”的初步调研，核心参考包括 ${titles}，但仍有 ${unresolvedIssues.length} 个未解决问题需要注意。`;
  }

  return `已基于 ${sources.length} 个来源完成“${goal}”的调研总结，核心参考包括 ${titles}。`;
}

function buildResearchFinalMarkdown(summary: string, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  const lines = [
    "## 结论摘要",
    summary,
    "",
    "## 来源要点",
    ...(sources.length > 0
      ? sources.map((source, index) => {
          const title = source.pageTitle || source.candidate.title;
          const detail =
            source.status === "success" ? source.summary : `${source.summary || "该来源仅得到部分事实。"} (${source.unresolvedIssues.join("；") || "来源可读性不足"})`;
          return `- ${index + 1}. ${title}：${detail}`;
        })
      : ["- 暂无可靠来源"]),
    "",
    "## 来源链接",
    ...(sources.length > 0
      ? sources.map((source, index) => `- ${index + 1}. [${source.pageTitle || source.candidate.title}](${source.sourceUrl})`)
      : ["- 暂无可靠来源"]),
    "",
    "## 未解决问题",
    ...(unresolvedIssues.length > 0 ? unresolvedIssues.map((issue) => `- ${issue}`) : ["- 暂无"]),
  ];

  return lines.join("\n");
}

function dedupeIssues(issues: string[]) {
  return Array.from(new Set(issues.filter(Boolean)));
}

function countSuccessfulResearchSources(sources: ResearchSourceResult[]) {
  return sources.filter((source) => source.status === "success").length;
}

function getOverallStatusForResearch(taskSpec: PublicResearchTaskSpec, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  const successfulSourceCount = countSuccessfulResearchSources(sources);

  if (successfulSourceCount === 0) {
    return "failed" as const;
  }

  if (
    successfulSourceCount < taskSpec.sourceTargetCount ||
    unresolvedIssues.length > 0 ||
    sources.some((source) => source.status !== "success")
  ) {
    return "partial" as const;
  }

  return "success" as const;
}

function getBlockedReason(url: string, error?: string) {
  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return "PDF 页面未做正文提取";
  }

  if (error?.includes("Could not establish connection")) {
    return "页面不可访问或未注入内容脚本";
  }

  return error || "页面不可读取";
}

function isCommerceTask(taskSpec: TaskSpec | undefined): taskSpec is CommerceTaskSpec {
  return !!taskSpec && taskSpec.taskType === "commerce_search";
}

function isResearchTask(taskSpec: TaskSpec | undefined): taskSpec is PublicResearchTaskSpec {
  return !!taskSpec && taskSpec.taskType === "public_research";
}

function createToolResult(
  status: ToolResult["status"],
  summary: string,
  options: {
    outputs?: Record<string, unknown>;
    artifacts?: string[];
    facts?: Record<string, unknown>;
    errorCode?: string;
    retryHint?: string;
    stepStatus?: ToolResult["stepStatus"];
    nextPhase?: AgentPhase;
    stop?: boolean;
  } = {},
): ToolResult {
  return {
    status,
    summary,
    outputs: options.outputs ?? {},
    artifacts: options.artifacts ?? [],
    facts: options.facts ?? {},
    errorCode: options.errorCode,
    retryHint: options.retryHint,
    stepStatus: options.stepStatus,
    nextPhase: options.nextPhase,
    stop: options.stop,
  };
}

async function recoverByScroll(context: ToolExecutionContext, snapshot: SnapshotData, reason: string): Promise<ToolResult> {
  const resultList = snapshot.pageFacts.resultList;
  if (!resultList?.present || resultList.emptyState) {
    throw new RuntimeError(reason, "NO_RECOVERABLE_RESULTS");
  }

  if (context.memory.runtimeMeta.recoveryCount >= LIMITS.MAX_RUNTIME_RECOVERY) {
    throw new RuntimeError(`${reason} Recovery limit reached.`, "RECOVERY_EXHAUSTED");
  }

  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "SCROLL";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.recoveryCount}: scroll for more candidates.`;
  context.appendLog("runtime", "warn", "Triggering tool-local scroll recovery.", {
    reason,
    recoveryCount: context.memory.runtimeMeta.recoveryCount,
    resultList,
  });

  const action: AgentAction = { type: "SCROLL", direction: "down", amount: 920 };
  const result = await context.executeAction(action, "Scroll to load more result cards.");
  await context.settleAfterAction(action);
  const snapshotAfter = await context.scanPage();

  context.memory.runtimeMeta.currentStep += 1;
  context.memory.currentPhase = "extracting";
  context.recordStep({
    stepSummary: "Scroll recovery completed.",
    nextIntent: "Extract the refreshed result list again.",
    expectedOutcome: "More product cards become visible.",
    action,
    actionResult: result,
    snapshot: snapshotAfter,
  });

  return createToolResult("partial", reason, {
    outputs: {
      recoveryAction: "SCROLL",
      recoveryCount: context.memory.runtimeMeta.recoveryCount,
    },
    facts: {
      recoveryAction: "SCROLL",
      recoveryCount: context.memory.runtimeMeta.recoveryCount,
    },
    retryHint: "Retry the same collection step after the list refreshes.",
    stepStatus: "running",
    nextPhase: "extracting",
  });
}

const compileTaskSpecTool: AgentToolDefinition = {
  name: "compileTaskSpec",
  async run(context) {
    context.memory.runtimeMeta.status = "planning";
    context.memory.currentPhase = "planning";
    await context.pushState("Compile the current goal into a structured task.");

    const compiled = await compileTaskSpec(context.memory.goal, {
      taskType: context.memory.taskType,
      refineCommerceWithLiteModel: async (goal) => {
        context.memory.runtimeMeta.queryRefineTried = true;
        const refined = await refineCommerceSearchQuery(goal, { signal: context.signal });
        context.appendLog("llm", "info", "Refined the commerce search query with the lite model.", {
          model: refined.model,
          provider: refined.provider,
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        });
        return {
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        };
      },
      refineResearchWithLiteModel: async (goal) => {
        context.memory.runtimeMeta.queryRefineTried = true;
        const refined = await refineResearchQuery(goal, { signal: context.signal });
        context.appendLog("llm", "info", "Refined the research query with the lite model.", {
          model: refined.model,
          provider: refined.provider,
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        });
        return {
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        };
      },
    });

    context.memory.taskType = compiled.taskType;
    context.memory.taskSpec = compiled.taskSpec;
    context.memory.taskPlan = {
      ...compiled.taskPlan,
      steps: context.memory.plan,
    };
    context.memory.currentPhase = "searching";
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      taskType: compiled.taskType,
      searchQuery: compiled.taskSpec.searchQuery,
    };
    context.memory.nextIntent = compiled.taskType === "commerce_search" ? "Open the JD search results page." : "Open the Google search results page.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = undefined;

    context.recordStep({
      stepSummary: "Structured task compiled.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "A stable query and task plan are available.",
      snapshotSummary: `${compiled.taskType} | ${compiled.taskSpec.searchQuery}`,
    });
    context.appendLog("runtime", "info", "Structured task created.", compiled);

    return createToolResult("success", `Query ready: ${compiled.taskSpec.searchQuery}`, {
      outputs: {
        taskType: compiled.taskType,
        searchQuery: compiled.taskSpec.searchQuery,
      },
      facts: {
        taskType: compiled.taskType,
        searchQuery: compiled.taskSpec.searchQuery,
      },
      stepStatus: "succeeded",
      nextPhase: "searching",
    });
  },
};

const openSearchResultsTool: AgentToolDefinition = {
  name: "openSearchResults",
  async run(context) {
    if (!context.memory.taskSpec) {
      throw new RuntimeError("Task spec is missing before search.", "TASK_SPEC_MISSING");
    }

    const snapshot = await context.ensureUsableSnapshot();
    const expectedSearchPage = context.memory.taskSpec.taskType === "commerce_search" ? "search" : "google_search";

    if (snapshot.pageType === expectedSearchPage && hasMatchingQuery(snapshot, context.memory.taskSpec.searchQuery)) {
      context.memory.currentPhase = "extracting";
      context.memory.currentFacts = {
        ...context.memory.currentFacts,
        pageType: snapshot.pageType,
        searchQueryMatched: true,
      };
      context.appendLog("runtime", "info", "The target search results page is already open.");
      return createToolResult("success", "Search page already matched the current query.", {
        outputs: {
          pageType: snapshot.pageType,
          searchQueryMatched: true,
        },
        facts: {
          pageType: snapshot.pageType,
          searchQueryMatched: true,
        },
        stepStatus: "succeeded",
        nextPhase: "extracting",
      });
    }

    const action: AgentAction = {
      type: "NAVIGATE",
      url: buildSearchUrl(context.memory.taskSpec),
    };

    const result = await context.executeAction(
      action,
      context.memory.taskType === "commerce_search"
        ? `Open the JD search results for "${context.memory.taskSpec.searchQuery}".`
        : `Open the Google search results for "${context.memory.taskSpec.searchQuery}".`,
    );
    await context.settleAfterAction(action);
    const snapshotAfter = await context.scanPage();

    context.memory.rawExtractedItems = [];
    context.memory.extractedItems = [];
    context.memory.researchCandidates = [];
    context.memory.researchSources = [];
    context.memory.activeSourceIndex = 0;
    context.memory.filterDiagnostics = undefined;
    context.memory.unresolvedIssues = [];
    context.memory.runtimeMeta.recoveryCount = 0;
    context.memory.runtimeMeta.currentStep += 1;
    context.memory.currentPhase = "extracting";
    context.memory.nextIntent =
      context.memory.taskType === "commerce_search"
        ? "Extract product cards from the JD search results page."
        : "Extract the first-page natural results from Google.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = result.success ? undefined : result.message;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      pageType: snapshotAfter.pageType,
      lastSearchQuery: context.memory.taskSpec.searchQuery,
    };

    context.recordStep({
      stepSummary: "Search submitted.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "The page navigates to the search results view.",
      action,
      actionResult: result,
      snapshot: snapshotAfter,
    });
    context.appendLog("runtime", "info", "High-level search tool completed.", {
      taskType: context.memory.taskType,
      searchQuery: context.memory.taskSpec.searchQuery,
      resultMessage: result.message,
      toPage: snapshotAfter.pageType,
    });

    const blockedReason = detectSearchBlocker(context.memory.taskType, snapshotAfter);
    if (blockedReason) {
      throw new RuntimeError(blockedReason, "SEARCH_BLOCKED");
    }

    if (snapshotAfter.pageType !== expectedSearchPage) {
      throw new RuntimeError(
        context.memory.taskType === "commerce_search"
          ? `JD search did not open the expected results page; received ${snapshotAfter.pageType}.`
          : `Google search did not open the expected results page; received ${snapshotAfter.pageType}.`,
        "SEARCH_PAGE_UNEXPECTED",
      );
    }

    return createToolResult("success", `Search submitted: ${context.memory.taskSpec.searchQuery}`, {
      outputs: {
        pageType: snapshotAfter.pageType,
        lastSearchQuery: context.memory.taskSpec.searchQuery,
      },
      facts: {
        pageType: snapshotAfter.pageType,
        lastSearchQuery: context.memory.taskSpec.searchQuery,
      },
      stepStatus: "succeeded",
      nextPhase: "extracting",
    });
  },
};

const collectCommerceCandidatesTool: AgentToolDefinition = {
  name: "collectCommerceCandidates",
  async run(context) {
    const snapshot = await context.ensureUsableSnapshot();
    if (!isCommerceTask(context.memory.taskSpec)) {
      throw new RuntimeError("Commerce candidate collection requires a commerce task.", "INVALID_COMMERCE_COLLECTION");
    }

    if (snapshot.pageType !== "search") {
      context.memory.currentPhase = "searching";
      return createToolResult("retryable_error", `Expected a JD search page, received ${snapshot.pageType}.`, {
        outputs: {
          pageType: snapshot.pageType,
        },
        facts: {
          pageType: snapshot.pageType,
        },
        errorCode: "SEARCH_PAGE_UNEXPECTED",
        retryHint: "Re-open the search results page before collecting candidates again.",
        stepStatus: "running",
        nextPhase: "searching",
      });
    }

    const action: AgentAction = {
      type: "EXTRACT_LIST",
      limit: context.memory.taskSpec.extractLimit,
    };
    const extractResult = await context.executeAction(action, "Extract structured search result items.");
    const snapshotAfter = await context.scanPage();

    context.memory.runtimeMeta.currentStep += 1;
    context.memory.rawExtractedItems = extractResult.items ?? [];
    context.memory.lastError = extractResult.success ? undefined : extractResult.message;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      lastRawExtractedCount: extractResult.items?.length ?? 0,
    };
    context.recordStep({
      stepSummary: "Commerce candidates extracted.",
      nextIntent: "Validate and keep the usable candidates.",
      expectedOutcome: "At least a few structured product items are available.",
      action,
      actionResult: extractResult,
      snapshot: snapshotAfter,
    });
    context.appendLog("content", extractResult.success ? "info" : "warn", "Commerce extraction finished.", {
      message: extractResult.message,
      itemCount: extractResult.items?.length ?? 0,
      observation: extractResult.observation,
    });

    if (!extractResult.items?.length) {
      return recoverByScroll(context, snapshotAfter, "No product items were extracted.");
    }

    const filtered = filterExtractedItems(context.memory.rawExtractedItems, context.memory.taskSpec);
    context.memory.runtimeMeta.status = "observing";
    context.memory.filterDiagnostics = filtered.diagnostics;
    context.memory.extractedItems = filtered.items;
    context.memory.lastError = undefined;
    context.memory.recoveryHint = undefined;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      filteredCount: filtered.items.length,
      budgetMatchedCount: filtered.diagnostics.budgetMatchedCount,
    };
    context.recordStep({
      stepSummary: "Commerce candidates filtered.",
      nextIntent: "Aggregate the final recommendation.",
      expectedOutcome: "Enough clean candidates remain after filtering.",
      snapshotSummary: JSON.stringify(filtered.diagnostics),
    });
    context.appendLog("runtime", "info", "Commerce filtering completed.", filtered.diagnostics);

    const minimumSummaryCount = Math.max(1, Math.min(3, context.memory.taskSpec.topK));
    if (filtered.items.length >= minimumSummaryCount) {
      context.memory.currentPhase = "aggregating";
      return createToolResult("success", `Prepared ${filtered.items.length} commerce candidates for aggregation.`, {
        outputs: {
          candidateCount: filtered.items.length,
          filterDiagnostics: filtered.diagnostics,
        },
        facts: {
          filteredCount: filtered.items.length,
          budgetMatchedCount: filtered.diagnostics.budgetMatchedCount,
        },
        stepStatus: "succeeded",
        nextPhase: "aggregating",
      });
    }

    return recoverByScroll(
      context,
      snapshot,
      `Only ${filtered.items.length} candidates remained after filtering. Need at least ${minimumSummaryCount}.`,
    );
  },
};

const collectResearchCandidatesTool: AgentToolDefinition = {
  name: "collectResearchCandidates",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research candidate collection requires a public research task.", "INVALID_RESEARCH_COLLECTION");
    }

    const snapshot = await context.ensureUsableSnapshot();
    if (snapshot.pageType !== "google_search") {
      context.memory.currentPhase = "searching";
      return createToolResult("retryable_error", `Expected a Google search page, received ${snapshot.pageType}.`, {
        outputs: {
          pageType: snapshot.pageType,
        },
        facts: {
          pageType: snapshot.pageType,
        },
        errorCode: "SEARCH_PAGE_UNEXPECTED",
        retryHint: "Re-open the Google results page before collecting research candidates again.",
        stepStatus: "running",
        nextPhase: "searching",
      });
    }

    const action: AgentAction = {
      type: "EXTRACT_SEARCH_RESULTS",
      limit: context.memory.taskSpec.candidateLimit * 2,
    };
    const extractResult = await context.executeAction(action, "Extract natural results from the Google search page.");
    const snapshotAfter = await context.scanPage();

    context.memory.runtimeMeta.currentStep += 1;
    context.memory.researchCandidates = extractResult.researchCandidates ?? [];
    context.memory.lastError = extractResult.success ? undefined : extractResult.message;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      lastResearchCandidateCount: extractResult.researchCandidates?.length ?? 0,
    };
    context.recordStep({
      stepSummary: "Research candidates extracted.",
      nextIntent: "Filter the extracted source candidates.",
      expectedOutcome: "Candidate sources are ready for filtering.",
      action,
      actionResult: extractResult,
      snapshot: snapshotAfter,
    });
    context.appendLog("content", extractResult.success ? "info" : "warn", "Research extraction finished.", {
      message: extractResult.message,
      candidateCount: extractResult.researchCandidates?.length ?? 0,
      observation: extractResult.observation,
    });

    const filtered = filterResearchCandidates(context.memory.researchCandidates, context.memory.taskSpec.candidateLimit);
    context.memory.runtimeMeta.status = "observing";
    context.memory.filterDiagnostics = filtered.diagnostics;
    context.memory.researchCandidates = filtered.candidates;
    context.memory.lastError = undefined;
    context.memory.recoveryHint = undefined;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      filteredSourceCount: filtered.candidates.length,
    };
    context.recordStep({
      stepSummary: "Research candidate filtering completed.",
      nextIntent: filtered.candidates.length > 0 ? "Read the selected source pages." : "Aggregate a partial result.",
      expectedOutcome: "A deduped top source list is available.",
      snapshotSummary: JSON.stringify(filtered.diagnostics),
    });
    context.appendLog("runtime", "info", "Research filtering completed.", filtered.diagnostics);

    if (filtered.candidates.length === 0) {
      context.memory.unresolvedIssues = dedupeIssues([...context.memory.unresolvedIssues, "Google 第一页未筛选出可用自然结果"]);
      context.memory.currentPhase = "aggregating";
      return createToolResult("partial", "No usable research sources remained after filtering.", {
        outputs: {
          candidateCount: 0,
          filterDiagnostics: filtered.diagnostics,
        },
        facts: {
          filteredSourceCount: 0,
        },
        retryHint: "Proceed to finalization with a partial result.",
        stepStatus: "succeeded",
        nextPhase: "aggregating",
      });
    }

    context.memory.currentPhase = "reading";
    return createToolResult("success", `Prepared ${filtered.candidates.length} source candidates for reading.`, {
      outputs: {
        candidateCount: filtered.candidates.length,
        filterDiagnostics: filtered.diagnostics,
      },
      facts: {
        filteredSourceCount: filtered.candidates.length,
      },
      stepStatus: "succeeded",
      nextPhase: "reading",
    });
  },
};

const readResearchSourceFactsTool: AgentToolDefinition = {
  name: "readResearchSourceFacts",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research source reading requires a public research task.", "INVALID_RESEARCH_READ");
    }

    if (countSuccessfulResearchSources(context.memory.researchSources) >= context.memory.taskSpec.sourceTargetCount) {
      context.memory.currentPhase = "aggregating";
      return createToolResult("success", "Reached the target number of research sources.", {
        outputs: {
          successfulSourceCount: countSuccessfulResearchSources(context.memory.researchSources),
        },
        facts: {
          successfulSourceCount: countSuccessfulResearchSources(context.memory.researchSources),
        },
        stepStatus: "succeeded",
        nextPhase: "aggregating",
      });
    }

    const candidate = context.memory.researchCandidates[context.memory.activeSourceIndex];
    if (!candidate) {
      context.memory.currentPhase = "aggregating";
      context.memory.unresolvedIssues = dedupeIssues([
        ...context.memory.unresolvedIssues,
        "候选来源已耗尽，未满足目标来源数",
      ]);
      return createToolResult("partial", "Research candidates were exhausted.", {
        outputs: {
          successfulSourceCount: countSuccessfulResearchSources(context.memory.researchSources),
          exhausted: true,
        },
        facts: {
          successfulSourceCount: countSuccessfulResearchSources(context.memory.researchSources),
          exhausted: true,
        },
        retryHint: "Proceed to finalization with the currently collected sources.",
        stepStatus: "succeeded",
        nextPhase: "aggregating",
      });
    }

    const action: AgentAction = {
      type: "NAVIGATE",
      url: candidate.url,
    };
    const navigationResult = await context.executeAction(action, `Open source ${context.memory.activeSourceIndex + 1}: ${candidate.title}`);
    await context.settleAfterAction(action);

    let sourceResult: ResearchSourceResult;
    let snapshotSummary: string | undefined;
    try {
      const snapshot = await context.scanPage();
      snapshotSummary = `${snapshot.pageType} | ${snapshot.title}`;
      const extractionResult = await context.executeAction(
        { type: "EXTRACT_PAGE_FACTS" },
        `Extract facts from ${candidate.title}.`,
      );

      const pageFacts = extractionResult.pageFactsResult;
      if (!pageFacts) {
        throw new RuntimeError("Page fact extraction returned an empty payload.", "PAGE_FACTS_EMPTY");
      }

      sourceResult = {
        candidate,
        status: pageFacts.status,
        pageTitle: pageFacts.pageTitle || candidate.title,
        summary: pageFacts.summary || pageFacts.reason || "来源页可读性不足。",
        keyPoints: pageFacts.keyPoints,
        sourceUrl: candidate.url,
        unresolvedIssues: pageFacts.reason ? [pageFacts.reason] : [],
        textLength: pageFacts.textLength,
      };
    } catch (error) {
      const reason = getBlockedReason(candidate.url, error instanceof Error ? error.message : undefined);
      sourceResult = {
        candidate,
        status: "partial",
        pageTitle: candidate.title,
        summary: `该来源未能完成正文提取：${reason}`,
        keyPoints: [],
        sourceUrl: candidate.url,
        unresolvedIssues: [reason],
        textLength: 0,
      };
    }

    context.memory.researchSources = [...context.memory.researchSources, sourceResult];
    context.memory.unresolvedIssues = dedupeIssues([
      ...context.memory.unresolvedIssues,
      ...sourceResult.unresolvedIssues,
    ]);
    context.memory.activeSourceIndex += 1;
    context.memory.runtimeMeta.currentStep += 1;
    const successfulSourceCount = countSuccessfulResearchSources(context.memory.researchSources);
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      readSourceCount: context.memory.researchSources.length,
      successfulSourceCount,
    };
    context.memory.lastError = undefined;
    context.recordStep({
      stepSummary: `Source processed: ${sourceResult.pageTitle || candidate.title}`,
      nextIntent:
        successfulSourceCount >= context.memory.taskSpec.sourceTargetCount ||
        context.memory.activeSourceIndex >= context.memory.researchCandidates.length
          ? "Aggregate the final research result."
          : "Open the next source candidate.",
      expectedOutcome: "A structured source summary is recorded.",
      action,
      actionResult: navigationResult,
      snapshotSummary,
    });
    context.appendLog("runtime", sourceResult.status === "success" ? "info" : "warn", "Research source processed.", {
      title: sourceResult.pageTitle,
      status: sourceResult.status,
      unresolvedIssues: sourceResult.unresolvedIssues,
    });

    const shouldAggregate =
      successfulSourceCount >= context.memory.taskSpec.sourceTargetCount ||
      context.memory.activeSourceIndex >= context.memory.researchCandidates.length;
    context.memory.currentPhase = shouldAggregate ? "aggregating" : "reading";
    return createToolResult(sourceResult.status === "success" ? "success" : "partial", `Processed source ${successfulSourceCount}/${context.memory.taskSpec.sourceTargetCount} successful.`, {
      outputs: {
        sourceTitle: sourceResult.pageTitle,
        sourceStatus: sourceResult.status,
        successfulSourceCount,
        processedSourceCount: context.memory.researchSources.length,
      },
      facts: {
        readSourceCount: context.memory.researchSources.length,
        successfulSourceCount,
      },
      retryHint: shouldAggregate ? undefined : "Continue reading the next selected source.",
      stepStatus: shouldAggregate ? "succeeded" : "running",
      nextPhase: shouldAggregate ? "aggregating" : "reading",
    });
  },
};

function completeFinalResult(
  context: ToolExecutionContext,
  overallStatus: "success" | "partial" | "failed",
  summary: string,
  finalOutput: string,
) {
  context.memory.finalSummary = summary;
  context.memory.finalOutput = finalOutput;
  context.memory.finalResult = {
      overallStatus,
      summaryMarkdown: finalOutput,
      usedSubtasks: context.memory.taskPlan?.steps.map((step) => step.stepId) ?? [],
      unresolvedIssues: context.memory.unresolvedIssues,
  };
  context.memory.runtimeMeta.status = "done";
  context.memory.runtimeMeta.currentStep += 1;
  context.memory.currentPhase = "done";
  context.memory.liveStepSummary = "Final output is ready.";
  context.memory.recoveryHint = undefined;
  context.memory.lastError = undefined;
  context.memory.currentFacts = {
    ...context.memory.currentFacts,
    finalStatus: overallStatus,
  };

  context.recordStep({
    stepSummary: "Final output generated.",
    nextIntent: "Stop the session.",
    expectedOutcome: "A Markdown result is ready for the side panel.",
    action: {
      type: "DONE",
      summary,
      items: context.memory.extractedItems,
    },
    snapshotSummary: `${overallStatus} -> markdown`,
  });

  return createToolResult(overallStatus === "success" ? "success" : overallStatus === "partial" ? "partial" : "fatal_error", "Final Markdown output generated.", {
    outputs: {
      overallStatus,
      finalOutput,
    },
    facts: {
      finalStatus: overallStatus,
    },
    stepStatus: "succeeded",
    nextPhase: "done",
    stop: true,
  });
}

const finalizeCommerceResultTool: AgentToolDefinition = {
  name: "finalizeCommerceResult",
  async run(context) {
    if (!isCommerceTask(context.memory.taskSpec)) {
      throw new RuntimeError("Commerce finalization requires a commerce task.", "INVALID_COMMERCE_FINALIZE");
    }

    await context.pushState("Aggregate the structured task results into the final output.");

    let summary = "";
    let finalOutput = "";
    let overallStatus: "success" | "partial" | "failed" = "failed";

    if (context.memory.extractedItems.length === 0) {
      summary = `未能为“${context.memory.goal}”收集到足够的商品候选。`;
      finalOutput = buildCommerceFinalMarkdown(context.memory.goal, [], summary);
      overallStatus = "failed";
    } else {
      try {
        const response = await generateCommerceSummary(
          context.memory.goal,
          context.memory.taskSpec,
          context.memory.extractedItems,
          { signal: context.signal },
        );
        summary = response.summary;
        finalOutput = response.markdown;
        context.appendLog("llm", "info", "Generated the final commerce recommendation.", {
          itemCount: context.memory.extractedItems.length,
          topK: context.memory.taskSpec.topK,
          provider: response.provider,
          model: response.model,
        });
      } catch (error) {
        summary = buildRuleBasedSummary(context.memory.goal, context.memory.extractedItems);
        finalOutput = buildCommerceFinalMarkdown(context.memory.goal, context.memory.extractedItems, summary);
        context.appendLog("llm", "warn", "Fell back to rule-based commerce output after LLM summary failed.", {
          message: error instanceof Error ? error.message : "Unknown final summary error",
        });
      }
      overallStatus = "success";
    }

    return completeFinalResult(context, overallStatus, summary, finalOutput);
  },
};

const finalizeResearchResultTool: AgentToolDefinition = {
  name: "finalizeResearchResult",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research finalization requires a public research task.", "INVALID_RESEARCH_FINALIZE");
    }

    await context.pushState("Aggregate the structured task results into the final output.");

    const unresolvedIssues = dedupeIssues([
      ...context.memory.unresolvedIssues,
      ...context.memory.researchSources.flatMap((source) => source.unresolvedIssues),
    ]);
    const successfulSourceCount = countSuccessfulResearchSources(context.memory.researchSources);
    let summary = "";
    let finalOutput = "";

    if (successfulSourceCount === 0) {
      summary = buildResearchFallbackSummary(context.memory.goal, context.memory.researchSources, unresolvedIssues);
      finalOutput = buildResearchFinalMarkdown(summary, context.memory.researchSources, unresolvedIssues);
      context.appendLog("runtime", "warn", "No reliable sources were available; used deterministic research fallback.", {
        sourceCount: context.memory.researchSources.length,
        unresolvedIssues,
      });
    } else {
      try {
        const response = await generateResearchSummary(
          context.memory.goal,
          context.memory.taskSpec,
          context.memory.researchSources,
          unresolvedIssues,
          { signal: context.signal },
        );
        summary = response.summary;
        finalOutput = response.markdown;
        context.appendLog("llm", "info", "Generated the final research summary.", {
          sourceCount: context.memory.researchSources.length,
          provider: response.provider,
          model: response.model,
        });
      } catch (error) {
        summary = buildResearchFallbackSummary(context.memory.goal, context.memory.researchSources, unresolvedIssues);
        finalOutput = buildResearchFinalMarkdown(summary, context.memory.researchSources, unresolvedIssues);
        context.appendLog("llm", "warn", "Fell back to rule-based research output after LLM summary failed.", {
          message: error instanceof Error ? error.message : "Unknown final summary error",
        });
      }
    }

    const overallStatus = getOverallStatusForResearch(context.memory.taskSpec, context.memory.researchSources, unresolvedIssues);
    context.memory.unresolvedIssues = unresolvedIssues;
    return completeFinalResult(context, overallStatus, summary, finalOutput);
  },
};

const TOOL_REGISTRY: Record<ToolName, AgentToolDefinition> = {
  compileTaskSpec: compileTaskSpecTool,
  openSearchResults: openSearchResultsTool,
  collectCommerceCandidates: collectCommerceCandidatesTool,
  collectResearchCandidates: collectResearchCandidatesTool,
  readResearchSourceFacts: readResearchSourceFactsTool,
  finalizeCommerceResult: finalizeCommerceResultTool,
  finalizeResearchResult: finalizeResearchResultTool,
};

export function getToolDefinition(toolName: ToolName) {
  return TOOL_REGISTRY[toolName];
}
