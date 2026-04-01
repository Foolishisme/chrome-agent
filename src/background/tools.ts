import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type {
  AgentAction,
  AgentPhase,
  DebugLogEntry,
  DebugLogLevel,
  ExtractedItem,
  SessionMemory,
  SnapshotData,
  ToolName,
  ToolResult,
} from "../shared/types";
import { compileSearchTask } from "./query-compiler";
import { filterExtractedItems } from "./result-filter";

type StepOptions = {
  stepSummary: string;
  nextIntent?: string;
  expectedOutcome?: string;
  action?: AgentAction;
  actionResult?: ToolResult;
  snapshot?: SnapshotData;
  snapshotSummary?: string;
};

export interface ToolExecutionContext {
  memory: SessionMemory;
  signal: AbortSignal;
  scanPage(): Promise<SnapshotData>;
  ensureUsableSnapshot(): Promise<SnapshotData>;
  executeAction(action: AgentAction, stepSummary: string): Promise<ToolResult>;
  settleAfterAction(action: AgentAction): Promise<void>;
  appendLog(source: DebugLogEntry["source"], level: DebugLogLevel, message: string, detail?: unknown): void;
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface ToolExecutionResult {
  nextPhase: AgentPhase;
  summary: string;
  stop?: boolean;
}

export interface AgentToolDefinition {
  name: ToolName;
  run(context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

function normalizeText(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function hasMatchingQuery(snapshot: SnapshotData, searchQuery: string) {
  return normalizeText(snapshot.pageFacts.searchBox.text).includes(normalizeText(searchQuery));
}

export async function compileTaskSpecRuleOnly(goal: string) {
  return compileSearchTask(goal);
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

function buildFinalMarkdown(goal: string, items: ExtractedItem[], summary: string) {
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

async function recoverByScroll(context: ToolExecutionContext, snapshot: SnapshotData, reason: string): Promise<ToolExecutionResult> {
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

  return {
    nextPhase: "extracting",
    summary: reason,
  };
}

const compileTaskTool: AgentToolDefinition = {
  name: "compileTask",
  async run(context) {
    context.memory.runtimeMeta.status = "planning";
    context.memory.currentPhase = "planning";
    await context.pushState("Compile the shopping task into a structured search spec.");

    context.memory.runtimeMeta.queryRefineTried = false;
    const taskSpec = await compileTaskSpecRuleOnly(context.memory.goal);

    context.memory.taskSpec = taskSpec;
    context.memory.currentPhase = "searching";
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      searchQuery: taskSpec.searchQuery,
      querySource: taskSpec.querySource,
      budget: taskSpec.budget,
      topK: taskSpec.topK,
    };
    context.memory.nextIntent = "Submit the query on JD and open the search results page.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = undefined;

    context.recordStep({
      stepSummary: "Structured task compiled.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "A stable on-site query is available.",
      snapshotSummary: `${taskSpec.searchQuery} | ${taskSpec.querySource}`,
    });
    context.appendLog("runtime", "info", "Structured task created.", taskSpec);

    return {
      nextPhase: "searching",
      summary: `Query ready: ${taskSpec.searchQuery}`,
    };
  },
};

const searchInSiteTool: AgentToolDefinition = {
  name: "searchInSite",
  async run(context) {
    if (!context.memory.taskSpec) {
      throw new RuntimeError("Task spec is missing before search.", "TASK_SPEC_MISSING");
    }

    const snapshot = await context.ensureUsableSnapshot();
    if (snapshot.pageType === "search" && hasMatchingQuery(snapshot, context.memory.taskSpec.searchQuery)) {
      context.memory.currentPhase = "extracting";
      context.memory.currentFacts = {
        ...context.memory.currentFacts,
        pageType: snapshot.pageType,
        searchQueryMatched: true,
      };
      context.appendLog("runtime", "info", "The target search results page is already open.");
      return {
        nextPhase: "extracting",
        summary: "Search page already matched the current query.",
      };
    }

    const action: AgentAction = {
      type: "TYPE",
      agentId: "el_search_input",
      text: context.memory.taskSpec.searchQuery,
      submit: true,
    };

    const result = await context.executeAction(action, `Submit the query "${context.memory.taskSpec.searchQuery}".`);
    await context.settleAfterAction(action);
    const snapshotAfter = await context.scanPage();

    context.memory.rawExtractedItems = [];
    context.memory.extractedItems = [];
    context.memory.filterDiagnostics = undefined;
    context.memory.runtimeMeta.recoveryCount = 0;
    context.memory.runtimeMeta.currentStep += 1;
    context.memory.currentPhase = "extracting";
    context.memory.nextIntent = "Extract product cards from the JD search results page.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = result.success ? undefined : result.message;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      pageType: snapshotAfter.pageType,
      lastSearchQuery: context.memory.taskSpec.searchQuery,
    };

    context.recordStep({
      stepSummary: "On-site search submitted.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "The page navigates to the search results view.",
      action,
      actionResult: result,
      snapshot: snapshotAfter,
    });
    context.appendLog("runtime", "info", "High-level search tool completed.", {
      searchQuery: context.memory.taskSpec.searchQuery,
      resultMessage: result.message,
      toPage: snapshotAfter.pageType,
    });

    return {
      nextPhase: "extracting",
      summary: `Search submitted: ${context.memory.taskSpec.searchQuery}`,
    };
  },
};

const extractStructuredResultsTool: AgentToolDefinition = {
  name: "extractStructuredResults",
  async run(context) {
    const snapshot = await context.ensureUsableSnapshot();
    if (snapshot.pageType !== "search") {
      context.memory.currentPhase = "searching";
      return {
        nextPhase: "searching",
        summary: `Expected a search page, received ${snapshot.pageType}.`,
      };
    }

    const action: AgentAction = { type: "EXTRACT_LIST" };
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
      stepSummary: "Structured extraction completed.",
      nextIntent: "Filter the extracted candidates.",
      expectedOutcome: "At least a few structured product items are available.",
      action,
      actionResult: extractResult,
      snapshot: snapshotAfter,
    });
    context.appendLog("content", extractResult.success ? "info" : "warn", "Structured extraction finished.", {
      message: extractResult.message,
      itemCount: extractResult.items?.length ?? 0,
      observation: extractResult.observation,
    });

    if (!extractResult.items?.length) {
      return recoverByScroll(context, snapshotAfter, "No product items were extracted.");
    }

    context.memory.currentPhase = "filtering";
    return {
      nextPhase: "filtering",
      summary: `Extracted ${extractResult.items.length} raw items.`,
    };
  },
};

const filterCandidatesTool: AgentToolDefinition = {
  name: "filterCandidates",
  async run(context) {
    if (!context.memory.taskSpec) {
      throw new RuntimeError("Task spec is missing before filtering.", "TASK_SPEC_MISSING");
    }

    await context.pushState("Filter candidates by completeness, dedupe, and budget.");
    const snapshot = await context.ensureUsableSnapshot();
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
      stepSummary: "Candidate filtering completed.",
      nextIntent: "Decide whether the final summary can be generated.",
      expectedOutcome: "Enough clean candidates remain after filtering.",
      snapshotSummary: JSON.stringify(filtered.diagnostics),
    });
    context.appendLog("runtime", "info", "Filtering completed.", filtered.diagnostics);

    const requiredCount = Math.max(3, context.memory.taskSpec.topK);
    if (filtered.items.length >= requiredCount) {
      context.memory.currentPhase = "summarizing";
      return {
        nextPhase: "summarizing",
        summary: `Prepared ${filtered.items.length} candidates for summarization.`,
      };
    }

    return recoverByScroll(
      context,
      snapshot,
      `Only ${filtered.items.length} candidates remained after filtering. Need ${requiredCount}.`,
    );
  },
};

const finishWithSummaryTool: AgentToolDefinition = {
  name: "finishWithSummary",
  async run(context) {
    if (!context.memory.taskSpec || context.memory.extractedItems.length === 0) {
      throw new RuntimeError("There are not enough items to produce the final summary.", "FINALIZE_BLOCKED");
    }

    await context.pushState("Assemble the final recommendation with rule-based tools.");

    const summary = buildRuleBasedSummary(context.memory.goal, context.memory.extractedItems);
    context.appendLog("runtime", "info", "Generated the final summary with rule-based tools.", {
      itemCount: context.memory.extractedItems.length,
      topK: context.memory.taskSpec.topK,
    });

    context.memory.finalSummary = summary;
    context.memory.finalOutput = buildFinalMarkdown(context.memory.goal, context.memory.extractedItems, summary);
    context.memory.runtimeMeta.status = "done";
    context.memory.runtimeMeta.currentStep += 1;
    context.memory.currentPhase = "done";
    context.memory.liveStepSummary = "Final recommendation is ready.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = undefined;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      finalCandidateCount: context.memory.extractedItems.length,
    };

    context.recordStep({
      stepSummary: "Final recommendation generated.",
      nextIntent: "Stop the session.",
      expectedOutcome: "A Markdown result is ready for the side panel.",
      action: {
        type: "DONE",
        summary,
        items: context.memory.extractedItems,
      },
      snapshotSummary: `${context.memory.extractedItems.length} items -> markdown`,
    });

    return {
      nextPhase: "done",
      summary: "Final markdown recommendation generated.",
      stop: true,
    };
  },
};

const TOOL_ORDER: Record<AgentPhase, ToolName> = {
  planning: "compileTask",
  searching: "searchInSite",
  extracting: "extractStructuredResults",
  filtering: "filterCandidates",
  summarizing: "finishWithSummary",
  done: "finishWithSummary",
};

const TOOL_REGISTRY: Record<ToolName, AgentToolDefinition> = {
  compileTask: compileTaskTool,
  searchInSite: searchInSiteTool,
  extractStructuredResults: extractStructuredResultsTool,
  filterCandidates: filterCandidatesTool,
  finishWithSummary: finishWithSummaryTool,
};

export function getNextToolName(phase: AgentPhase): ToolName {
  return TOOL_ORDER[phase];
}

export function getToolDefinition(toolName: ToolName) {
  return TOOL_REGISTRY[toolName];
}
