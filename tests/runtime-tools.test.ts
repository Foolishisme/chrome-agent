import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRuleBasedSummary, getToolDefinition } from "../src/background/tools";
import { compileSearchTask } from "../src/background/query-compiler";
import type { SessionMemory, SnapshotData, ToolResult } from "../src/shared/types";

function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    url: "https://search.jd.com/Search?keyword=MacBook",
    title: "MacBook - 京东搜索",
    pageType: "search",
    interactiveElements: [],
    productCandidates: [],
    pageReady: {
      ready: true,
      reason: "搜索结果页可用",
      checks: [],
    },
    pageFacts: {
      searchBox: { present: true, visible: true, text: "MacBook" },
      searchSubmit: { present: true, visible: true, text: "搜索" },
      resultList: {
        present: true,
        loaded: true,
        cardCount: 0,
        productLinkCount: 3,
        emptyState: false,
      },
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

function createMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    goal: "MacBook 对比前3个",
    currentPhase: "filtering",
    plan: [],
    toolHistory: [],
    currentFacts: {},
    stepHistory: [],
    logs: [],
    rawExtractedItems: [],
    extractedItems: [],
    failures: [],
    runtimeMeta: {
      sessionId: "session-1",
      tabId: 1,
      pageType: "search",
      status: "observing",
      currentTool: undefined,
      currentStep: 2,
      llmRetryCount: 0,
      actionRetryCount: 0,
      pageReadyRetryCount: 0,
      recoveryCount: 0,
      queryRefineTried: false,
      startedAt: Date.now(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("runtime tool helpers", () => {
  it("builds the final on-site query directly from the lite model", async () => {
    const task = await compileSearchTask("推荐一个适合学生办公的 MacBook", {
      refineWithLiteModel: async () => ({
        searchQuery: "学生办公 MacBook",
        reason: "补全办公场景关键词",
      }),
    });

    expect(task.querySource).toBe("llm-lite");
    expect(task.searchQuery).toBe("学生办公 MacBook");
    expect(task.llmInputLimit).toBe(10);
  });

  it("builds a deterministic fallback summary from extracted items", () => {
    const summary = buildRuleBasedSummary("MacBook 对比前3个", [
      { title: "MacBook Air 13", priceText: "7999.00", url: "https://item.jd.com/1.html", shopText: "Apple 自营" },
      { title: "MacBook Pro 14", priceText: "12999.00", url: "https://item.jd.com/2.html" },
      { title: "MacBook Air 15", priceText: "9999.00", url: "https://item.jd.com/3.html" },
    ]);

    expect(summary).toContain("kept 3 candidates");
    expect(summary).toContain("MacBook Air 13");
    expect(summary).toContain("Apple 自营");
  });
});

describe("runtime recovery path", () => {
  it("keeps scroll recovery available when results are insufficient but the page is ready", async () => {
    const tool = getToolDefinition("filterCandidates");
    const memory = createMemory({
      taskSpec: {
        originalGoal: "MacBook 对比前3个",
        topK: 3,
        llmInputLimit: 10,
        extractLimit: 12,
        searchQuery: "MacBook",
        querySource: "llm-lite",
        notes: [],
      },
      rawExtractedItems: [{ title: "MacBook Air 13", priceText: "7999.00", url: "https://item.jd.com/1.html" }],
    });
    const snapshot = createSnapshot();
    const scrollResult: ToolResult = {
      success: true,
      actionType: "SCROLL",
      message: "已向下滚动",
    };
    const executeAction = vi.fn().mockResolvedValue(scrollResult);
    const settleAfterAction = vi.fn().mockResolvedValue(undefined);
    const scanPage = vi.fn().mockResolvedValue(snapshot);
    const recordStep = vi.fn();

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage,
      ensureUsableSnapshot: vi.fn().mockResolvedValue(snapshot),
      executeAction,
      settleAfterAction,
      appendLog: vi.fn(),
      recordStep,
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.nextPhase).toBe("extracting");
    expect(executeAction).toHaveBeenCalledWith(
      { type: "SCROLL", direction: "down", amount: 920 },
      "Scroll to load more result cards.",
    );
    expect(memory.runtimeMeta.recoveryCount).toBe(1);
    expect(recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepSummary: "Scroll recovery completed.",
      }),
    );
  });
});

describe("search page query matching", () => {
  it("accepts a matching search result page even when the search input is missing", async () => {
    const tool = getToolDefinition("searchInSite");
    const memory = createMemory({
      currentPhase: "searching",
      taskSpec: {
        originalGoal: "macbookair",
        topK: 5,
        llmInputLimit: 10,
        extractLimit: 12,
        searchQuery: "macbookair",
        querySource: "llm-lite",
        notes: [],
      },
    });
    const snapshot = createSnapshot({
      url: "https://search.jd.com/Search?keyword=macbookair",
      title: "macbookair - 商品搜索",
      pageFacts: {
        searchBox: { present: false, visible: false, text: "" },
        searchSubmit: { present: true, visible: true, text: "搜索" },
        resultList: {
          present: true,
          loaded: true,
          cardCount: 29,
          productLinkCount: 29,
          emptyState: false,
        },
      },
    });
    const executeAction = vi.fn();

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(snapshot),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(snapshot),
      executeAction,
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.nextPhase).toBe("extracting");
    expect(executeAction).not.toHaveBeenCalled();
    expect(memory.currentFacts.searchQueryMatched).toBe(true);
  });
});
