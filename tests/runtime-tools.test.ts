import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRuleBasedSummary } from "../src/background/tools";
import { openSearchResultsTool } from "../src/background/tools/open-search-results";
import { compileSearchTask } from "../src/background/query-compiler";
import { finalizeTaskResult, prepareCommerceCandidates } from "../src/browser-core-v2/background/adapters";
import type { ActionResult, CommerceTaskSpec, SessionMemory, SnapshotData } from "../src/shared/types";

function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    url: "https://search.jd.com/Search?keyword=MacBook",
    title: "MacBook - JD Search",
    pageType: "search",
    interactiveElements: [],
    semanticSnapshot: {
      version: 1,
      url: "https://search.jd.com/Search?keyword=MacBook",
      title: "MacBook - JD Search",
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
      searchBox: { present: true, visible: true, text: "MacBook" },
      searchSubmit: { present: true, visible: true, text: "Search" },
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
  const memory: SessionMemory = {
    goal: "Compare a few MacBook options",
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
    unresolvedIssues: [],
    activeSourceIndex: 0,
    failures: [],
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

function createToolContext(
  memory: SessionMemory,
  overrides: Partial<{
    scanPage: () => Promise<SnapshotData>;
    ensureUsableSnapshot: () => Promise<SnapshotData>;
    executeAction: (action: unknown, stepSummary: string) => Promise<ActionResult>;
    settleAfterAction: (action: unknown) => Promise<void>;
    appendLog: (...args: unknown[]) => void;
    recordStep: (...args: unknown[]) => void;
    pushState: (stepSummary?: string) => Promise<void>;
  }> = {},
) {
  return {
    memory,
    signal: new AbortController().signal,
    scanPage: overrides.scanPage ?? vi.fn(),
    ensureUsableSnapshot: overrides.ensureUsableSnapshot ?? vi.fn(),
    executeAction: overrides.executeAction ?? vi.fn(),
    settleAfterAction: overrides.settleAfterAction ?? vi.fn().mockResolvedValue(undefined),
    appendLog: overrides.appendLog ?? vi.fn(),
    recordStep: overrides.recordStep ?? vi.fn(),
    pushState: overrides.pushState ?? vi.fn().mockResolvedValue(undefined),
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
    const task = await compileSearchTask("recommend a MacBook for study and office work", {
      refineWithLiteModel: async () => ({
        searchQuery: "student office MacBook",
        reason: "adds the office-work scenario",
      }),
    });

    expect(task.querySource).toBe("llm-lite");
    expect(task.searchQuery).toBe("student office MacBook");
    expect(task.llmInputLimit).toBe(10);
  });

  it("builds a deterministic fallback summary from extracted items", () => {
    const summary = buildRuleBasedSummary("Compare a few MacBook options", [
      { title: "MacBook Air 13", priceText: "7999.00", url: "https://item.jd.com/1.html", shopText: "Apple Store" },
      { title: "MacBook Pro 14", priceText: "12999.00", url: "https://item.jd.com/2.html" },
      { title: "MacBook Air 15", priceText: "9999.00", url: "https://item.jd.com/3.html" },
    ]);

    expect(summary).toContain("kept 3 candidates");
    expect(summary).toContain("MacBook Air 13");
    expect(summary).toContain("Apple Store");
  });

  it("finalizes a direct answer from conversation evidence when live generation is unavailable", async () => {
    const memory = createMemory({
      goal: "那第二点再展开一下",
      taskType: "direct_answer",
      plan: [
        {
          stepId: "compile-task-spec",
          goal: "compile",
          allowedTools: ["decideRoundAction"],
          successCriteria: [],
          status: "succeeded",
        },
        {
          stepId: "finalize-direct-answer",
          goal: "finalize",
          allowedTools: ["finalizeTaskResult"],
          successCriteria: [],
          status: "running",
        },
      ],
      conversationTurns: [
        {
          turnId: 1,
          sessionId: "session-1",
          goal: "解释一下 Playwright 和 Selenium 的区别",
          answerSummary: "Playwright 在现代浏览器支持和自动等待上更强。",
          answerMarkdown: "summary",
          timeline: [],
          savedAt: Date.now() - 10_000,
        },
      ],
      taskSpec: {
        taskType: "direct_answer",
        originalGoal: "那第二点再展开一下",
        outputMode: "inline",
        routeReason: "recent conversation already contains enough evidence",
        currentTimeIso: "2026-04-08T08:00:00.000Z",
        timezone: "Asia/Shanghai",
        evidenceTurnCount: 1,
      },
    });

    const result = await finalizeTaskResult(createToolContext(memory), "direct_answer");

    expect(result.finalStatus).toBe("partial");
    expect(memory.finalResult?.status).toBe("partial");
    expect(memory.finalResult?.markdown).toContain("当前会话依据");
    expect(memory.finalResult?.markdown).toContain("Playwright 在现代浏览器支持和自动等待上更强");
  });
});

describe("runtime recovery path", () => {
  it("uses scroll recovery inside the commerce collection tool", async () => {
    const memory = createMemory({
      taskSpec: {
        taskType: "commerce_search",
        originalGoal: "Compare a few MacBook options",
        topK: 3,
        llmInputLimit: 10,
        extractLimit: 12,
        searchQuery: "MacBook",
        querySource: "llm-lite",
        notes: [],
      },
    });
    const snapshot = createSnapshot();
    const executeAction = vi
      .fn<(...args: unknown[]) => Promise<ActionResult>>()
      .mockResolvedValueOnce({
        success: false,
        actionType: "EXTRACT_LIST",
        message: "no items",
        items: [],
      })
      .mockResolvedValueOnce({
        success: true,
        actionType: "SCROLL",
        message: "scrolled down",
      })
      .mockResolvedValueOnce({
        success: true,
        actionType: "EXTRACT_LIST",
        message: "extracted one item",
        items: [{ title: "MacBook Air 13", priceText: "7999.00", url: "https://item.jd.com/1.html" }],
      });
    const settleAfterAction = vi.fn().mockResolvedValue(undefined);
    const scanPage = vi.fn().mockResolvedValue(snapshot);
    const recordStep = vi.fn();
    const taskSpec = memory.taskSpec as CommerceTaskSpec;

    const result = await prepareCommerceCandidates(
      createToolContext(memory, {
        scanPage,
        ensureUsableSnapshot: vi.fn().mockResolvedValue(snapshot),
        executeAction,
        settleAfterAction,
        recordStep,
      }),
      taskSpec,
    );

    expect(result.status).toBe("partial");
    expect(executeAction).toHaveBeenNthCalledWith(2, { type: "SCROLL", direction: "down", amount: 920 }, "Scroll to load more result cards.");
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
    const tool = openSearchResultsTool;
    const memory = createMemory({
      taskType: "commerce_search",
      taskSpec: {
        taskType: "commerce_search",
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
      title: "macbookair - JD Search",
      pageFacts: {
        searchBox: { present: false, visible: false, text: "" },
        searchSubmit: { present: true, visible: true, text: "Search" },
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

    expect(result.stepStatus).toBe("succeeded");
    expect(result.outputs.searchQueryMatched).toBe(true);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("closes a blocking dialog once before continuing", async () => {
    const tool = openSearchResultsTool;
    const memory = createMemory({
      taskType: "commerce_search",
      taskSpec: {
        taskType: "commerce_search",
        originalGoal: "MacBook",
        topK: 5,
        llmInputLimit: 10,
        extractLimit: 12,
        searchQuery: "MacBook",
        querySource: "llm-lite",
        notes: [],
      },
    });
    const blockedSnapshot = createSnapshot({
      pageReady: {
        ready: false,
        reason: "dialog blocking the page",
        checks: ["dialog"],
      },
      semanticSnapshot: {
        version: 1,
        url: "https://search.jd.com/Search?keyword=MacBook",
        title: "MacBook - search",
        nodeCount: 2,
        truncated: false,
        root: {
          ref: "sem_root",
          role: "unknown",
          name: "",
          children: [
            {
              ref: "sem_dialog",
              role: "dialog",
              name: "Cookie popup",
              children: [],
            },
          ],
        },
      },
    });
    const readySnapshot = createSnapshot();
    const executeAction = vi.fn().mockResolvedValue({
      success: true,
      actionType: "RECOVER_CLOSE_DIALOG",
      message: "dialog closed",
      recoveryKind: "close_dialog",
      recoveryApplied: true,
      recoveryTarget: "close",
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValueOnce(blockedSnapshot).mockResolvedValueOnce(readySnapshot),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(readySnapshot),
      executeAction,
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("succeeded");
    expect(executeAction).toHaveBeenCalledWith(
      { type: "RECOVER_CLOSE_DIALOG" },
      "Close the blocking dialog once.",
    );
    expect(memory.runtimeMeta.dialogCloseRecoveryCount).toBe(1);
  });

  it("navigates directly to the JD search url when the current page does not match the query", async () => {
    const tool = openSearchResultsTool;
    const memory = createMemory({
      taskType: "commerce_search",
      taskSpec: {
        taskType: "commerce_search",
        originalGoal: "500 headphones",
        topK: 5,
        llmInputLimit: 10,
        extractLimit: 12,
        searchQuery: "500 headphones",
        querySource: "llm-lite",
        notes: [],
      },
    });
    const snapshot = createSnapshot({
      pageType: "home",
      url: "https://www.jd.com/",
      title: "JD Home",
      pageFacts: {
        searchBox: { present: true, visible: true, text: "" },
        searchSubmit: { present: true, visible: true, text: "Search" },
      },
    });
    const snapshotAfter = createSnapshot({
      url: "https://search.jd.com/Search?keyword=500+headphones&enc=utf-8",
      title: "500 headphones - JD Search",
    });
    const executeAction = vi.fn().mockResolvedValue({
      success: true,
      actionType: "NAVIGATE",
      message: "navigated",
      navigated: true,
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce(snapshotAfter),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(snapshot),
      executeAction,
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("succeeded");
    expect(executeAction).toHaveBeenCalledWith(
      {
        type: "NAVIGATE",
        url: "https://search.jd.com/Search?keyword=500+headphones&enc=utf-8",
      },
      'Open the JD search results for "500 headphones".',
    );
  });

  it("reopens the canonical search page once when the first result page is unexpected", async () => {
    const tool = openSearchResultsTool;
    const memory = createMemory({
      taskType: "commerce_search",
      taskSpec: {
        taskType: "commerce_search",
        originalGoal: "500 headphones",
        topK: 5,
        llmInputLimit: 10,
        extractLimit: 12,
        searchQuery: "500 headphones",
        querySource: "llm-lite",
        notes: [],
      },
    });
    const homeSnapshot = createSnapshot({
      pageType: "home",
      url: "https://www.jd.com/",
      title: "JD Home",
      pageFacts: {
        searchBox: { present: true, visible: true, text: "" },
        searchSubmit: { present: true, visible: true, text: "Search" },
      },
    });
    const unexpectedSnapshot = createSnapshot({
      pageType: "content",
      url: "https://example.com/unexpected",
      title: "Unexpected page",
      pageReady: { ready: true, reason: "loaded", checks: [] },
    });
    const recoveredSnapshot = createSnapshot({
      url: "https://search.jd.com/Search?keyword=500+headphones&enc=utf-8",
      title: "500 headphones - JD Search",
    });
    const executeAction = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        actionType: "NAVIGATE",
        message: "opened the initial search page",
        navigated: true,
      })
      .mockResolvedValueOnce({
        success: true,
        actionType: "NAVIGATE",
        message: "reopened the canonical search page",
        navigated: true,
      });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi
        .fn()
        .mockResolvedValueOnce(homeSnapshot)
        .mockResolvedValueOnce(unexpectedSnapshot)
        .mockResolvedValueOnce(recoveredSnapshot),
      ensureUsableSnapshot: vi
        .fn()
        .mockResolvedValueOnce(unexpectedSnapshot)
        .mockResolvedValueOnce(recoveredSnapshot),
      executeAction,
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("succeeded");
    expect(executeAction).toHaveBeenNthCalledWith(
      2,
      {
        type: "NAVIGATE",
        url: "https://search.jd.com/Search?keyword=500+headphones&enc=utf-8",
      },
      "Reopen the canonical search results page once.",
    );
    expect(memory.runtimeMeta.searchReopenRecoveryCount).toBe(1);
  });
});
