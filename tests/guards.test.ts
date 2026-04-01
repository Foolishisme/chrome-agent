import { describe, expect, it } from "vitest";
import { compareExpectedOutcome, ensureDoneAllowed, ensureAgentExists, isRepeatedAction } from "../src/background/guards";
import type { LlmDecision, SessionMemory, SnapshotData } from "../src/shared/types";

function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    url: "https://search.jd.com/",
    title: "search",
    pageType: "search",
    interactiveElements: [],
    productCandidates: [],
    pageReady: {
      ready: true,
      reason: "搜索结果页可用",
      checks: [],
    },
    pageFacts: {
      searchBox: { present: true, visible: true, text: "笔记本" },
      searchSubmit: { present: true, visible: true, text: "搜索" },
      resultList: {
        present: true,
        loaded: true,
        cardCount: 10,
        productLinkCount: 12,
        emptyState: false,
      },
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

function createMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    goal: "Find laptops",
    plan: [],
    stepHistory: [],
    logs: [],
    rawExtractedItems: [],
    extractedItems: [],
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

describe("guardrails", () => {
  it("blocks DONE when fewer than 3 items are available", () => {
    const memory = createMemory({
      extractedItems: [{ title: "A", priceText: "1", url: "https://a.com" }],
    });

    const decision: LlmDecision = {
      stepSummary: "Finish",
      nextIntent: "Stop",
      expectedOutcome: "Done",
      done: true,
      action: {
        type: "DONE",
        summary: "Summary",
      },
    };

    expect(() => ensureDoneAllowed(memory, decision)).toThrow();
  });

  it("detects repeated failed actions", () => {
    const memory = createMemory({
      stepHistory: [
        {
          step: 1,
          status: "acting",
          stepSummary: "Click search",
          action: { type: "CLICK", agentId: "el_search_submit" },
          actionResult: { success: false, actionType: "CLICK", message: "Failed" },
          timestamp: Date.now(),
        },
        {
          step: 2,
          status: "acting",
          stepSummary: "Click search",
          action: { type: "CLICK", agentId: "el_search_submit" },
          actionResult: { success: false, actionType: "CLICK", message: "Failed again" },
          timestamp: Date.now(),
        },
      ],
    });

    expect(isRepeatedAction(memory, { type: "CLICK", agentId: "el_search_submit" })).toBe(true);
  });

  it("allows fallback search agent ids on home or search pages", () => {
    const matched = ensureAgentExists(
      createSnapshot({
        interactiveElements: [],
      }),
      "el_search_input",
    );

    expect(matched.agentId).toBe("el_search_input");
  });

  it("treats partial extract results as progress", () => {
    const result = compareExpectedOutcome(
      undefined,
      createSnapshot(),
      "提取商品列表",
      { type: "EXTRACT_LIST" },
      {
        success: true,
        actionType: "EXTRACT_LIST",
        message: "已提取 1 个商品",
        items: [{ title: "A", priceText: "1", url: "https://a.com" }],
      },
    );

    expect(result.matched).toBe(true);
    expect(result.reason).toContain("1 个商品");
  });

  it("marks extract as not matched when page is still not ready", () => {
    const result = compareExpectedOutcome(
      undefined,
      createSnapshot({
        pageReady: {
          ready: false,
          reason: "搜索结果仍在加载",
          checks: ["搜索结果仍在加载"],
        },
        pageFacts: {
          searchBox: { present: true, visible: true, text: "笔记本" },
          searchSubmit: { present: true, visible: true, text: "搜索" },
          resultList: {
            present: true,
            loaded: false,
            cardCount: 0,
            productLinkCount: 0,
            emptyState: false,
          },
        },
      }),
      "提取商品列表",
      { type: "EXTRACT_LIST" },
      {
        success: false,
        actionType: "EXTRACT_LIST",
        message: "未提取到商品",
        items: [],
      },
    );

    expect(result.matched).toBe(false);
    expect(result.reason).toContain("页面尚未就绪");
  });
});
