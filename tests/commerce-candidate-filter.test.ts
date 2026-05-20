import { describe, expect, it, vi } from "vitest";
import { prepareCommerceCandidates } from "../src/background/tools/adapters/prepare-task-candidates";
import type {
  ActionResult,
  SearchTaskSpec,
  SessionMemory,
  SnapshotData,
} from "../src/shared/agent-domain-model";
import type { ToolExecutionContext } from "../src/background/tools/tool-execution-context";

const taskSpec: SearchTaskSpec = {
  taskType: "commerce_search",
  originalGoal: "帮我找 5000 元左右的笔记本电脑",
  category: "笔记本电脑",
  budget: 5000,
  budgetMin: 3500,
  budgetMax: 6500,
  topK: 5,
  llmInputLimit: 10,
  extractLimit: 20,
  searchQuery: "笔记本电脑 5000元",
  querySource: "rule",
  notes: [],
};

function createSearchSnapshot(): SnapshotData {
  return {
    url: "https://search.jd.com/Search?keyword=test",
    title: "JD Search",
    pageType: "search",
    interactiveElements: [],
    semanticSnapshot: {
      version: 1,
      url: "https://search.jd.com/Search?keyword=test",
      title: "JD Search",
      nodeCount: 1,
      truncated: false,
      root: { ref: "sem_root", role: "unknown", name: "", children: [] },
    },
    productCandidates: [],
    pageReady: { ready: true, reason: "ok", checks: [] },
    pageFacts: {
      searchBox: { present: true, visible: true, text: "test" },
      searchSubmit: { present: true, visible: true, text: "搜索" },
      resultList: { present: true, loaded: true, cardCount: 2, productLinkCount: 2, emptyState: false },
    },
    timestamp: Date.now(),
  };
}

function createMemory(): SessionMemory {
  return {
    goal: "帮我找 5000 元左右的笔记本电脑",
    taskType: "commerce_search",
    searchPreference: "auto",
    conversationTurns: [],
    plan: [],
    toolHistory: [],
    currentFacts: {},
    stepHistory: [],
    logs: [],
    rawExtractedItems: [],
    extractedItems: [],
    researchCandidates: [],
    researchSources: [],
    failures: [],
    unresolvedIssues: [],
    activeSourceIndex: 0,
    taskSpec,
    runtimeMeta: {
      sessionId: "session-1",
      tabId: 1,
      pageType: "search",
      status: "running",
      currentTool: undefined,
      currentStepId: undefined,
      currentStep: 1,
      actionRetryCount: 0,
      recoveryCount: 0,
      pageWaitRecoveryCount: 0,
      dialogCloseRecoveryCount: 0,
      searchReopenRecoveryCount: 0,
      queryRefineTried: false,
      sameToolRetryCount: 0,
      sameToolRetryTool: undefined,
      consecutiveNoProgressCount: 0,
      currentRound: 1,
      maxRounds: 2,
      startedAt: Date.now(),
    },
  };
}

function createContext(actionResult: ActionResult): ToolExecutionContext {
  const memory = createMemory();
  const snapshot = createSearchSnapshot();
  return {
    memory,
    signal: new AbortController().signal,
    scanPage: vi.fn(async () => snapshot),
    ensureUsableSnapshot: vi.fn(async () => snapshot),
    executeAction: vi.fn(async () => actionResult),
    settleAfterAction: vi.fn(async () => undefined),
    appendLog: vi.fn(),
    recordStep: vi.fn(),
    pushState: vi.fn(async () => undefined),
  };
}

describe("commerce candidate preparation", () => {
  it("dedupes items and applies the budget range first", async () => {
    const context = createContext({
      success: true,
      actionType: "EXTRACT_LIST",
      message: "ok",
      items: [
        { title: "A", priceText: "4999", url: "https://item.jd.com/a" },
        { title: "A", priceText: "4999", url: "https://item.jd.com/a" },
        { title: "B", priceText: "7999", url: "https://item.jd.com/b" },
        { title: "C", priceText: "4599", url: "https://item.jd.com/c" },
      ],
    });

    const result = await prepareCommerceCandidates(context, taskSpec);

    expect(result.items).toHaveLength(2);
    expect(result.diagnostics.dedupedCount).toBe(3);
    expect(result.diagnostics.budgetMatchedCount).toBe(2);
    expect(result.diagnostics.requestedTopK).toBe(5);
    expect(result.diagnostics.llmInputLimit).toBe(10);
    expect(result.items.map((item) => item.title)).toEqual(["A", "C"]);
  });

  it("falls back to deduped candidates when budget filtering removes everything", async () => {
    const context = createContext({
      success: true,
      actionType: "EXTRACT_LIST",
      message: "ok",
      items: [
        { title: "A", priceText: "8999", url: "https://item.jd.com/a" },
        { title: "B", priceText: "9999", url: "https://item.jd.com/b" },
      ],
    });

    const result = await prepareCommerceCandidates(context, taskSpec);

    expect(result.items).toHaveLength(2);
    expect(result.diagnostics.budgetMatchedCount).toBe(0);
  });
});
