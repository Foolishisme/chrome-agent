import { describe, expect, it } from "vitest";
import { compareExpectedOutcome, ensureAgentExists, isRepeatedAction } from "../src/background/runtime-action-guards";
import type { SessionMemory, SnapshotData } from "../src/shared/agent-domain-model";

function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    url: "https://search.jd.com/",
    title: "search",
    pageType: "search",
    interactiveElements: [],
    semanticSnapshot: {
      version: 1,
      url: "https://search.jd.com/",
      title: "search",
      nodeCount: 1,
      truncated: false,
      root: {
        ref: "sem_root",
        role: "unknown",
        name: "",
        children: [],
      },
    },
    productCandidates: [],
    pageReady: {
      ready: true,
      reason: "search results page is ready",
      checks: [],
    },
    pageFacts: {
      searchBox: { present: true, visible: true, text: "laptop" },
      searchSubmit: { present: true, visible: true, text: "Search" },
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
  const memory: SessionMemory = {
    goal: "Find laptops",
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
    runtimeMeta: {
      sessionId: "session-1",
      tabId: 1,
      pageType: "search",
      status: "running",
      currentTool: undefined,
      currentStepId: undefined,
      currentStep: 2,
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
    ...overrides,
  };
  memory.searchPreference = overrides.searchPreference ?? "auto";
  memory.conversationTurns = overrides.conversationTurns ?? [];
  return memory;
}

describe("guardrails", () => {
  it("detects repeated failed actions", () => {
    const memory = createMemory({
      stepHistory: [
        {
          step: 1,
          status: "running",
          stepSummary: "Click search",
          action: { type: "CLICK", agentId: "el_search_submit" },
          actionResult: { success: false, actionType: "CLICK", message: "Failed" },
          timestamp: Date.now(),
        },
        {
          step: 2,
          status: "running",
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
      "Extract product cards",
      { type: "EXTRACT_LIST" },
      {
        success: true,
        actionType: "EXTRACT_LIST",
        message: "Extracted 1 product.",
        items: [{ title: "A", priceText: "1", url: "https://a.com" }],
      },
    );

    expect(result.matched).toBe(true);
    expect(result.reason).toContain("1 product");
  });

  it("marks extract as not matched when page is still not ready", () => {
    const result = compareExpectedOutcome(
      undefined,
      createSnapshot({
        pageReady: {
          ready: false,
          reason: "still loading",
          checks: ["still loading"],
        },
        pageFacts: {
          searchBox: { present: true, visible: true, text: "laptop" },
          searchSubmit: { present: true, visible: true, text: "Search" },
          resultList: {
            present: true,
            loaded: false,
            cardCount: 0,
            productLinkCount: 0,
            emptyState: false,
          },
        },
      }),
      "Extract product cards",
      { type: "EXTRACT_LIST" },
      {
        success: false,
        actionType: "EXTRACT_LIST",
        message: "No products extracted",
        items: [],
      },
    );

    expect(result.matched).toBe(false);
    expect(result.reason).toContain("not ready");
  });
});
