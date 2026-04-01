import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRuleBasedSummary, compileTaskSpecRuleOnly, getToolDefinition } from "../src/background/tools";
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

describe("rule-only runtime helpers", () => {
  it("compiles task specs without using lite-model refinement", async () => {
    const task = await compileTaskSpecRuleOnly("推荐一个适合学生办公的 MacBook");

    expect(task.querySource).toBe("rule");
    expect(task.searchQuery).toContain("MacBook");
    expect(task.topK).toBe(5);
  });

  it("builds a deterministic final summary from extracted items", () => {
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
        category: "MacBook",
        topK: 3,
        searchQuery: "MacBook",
        querySource: "rule",
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
