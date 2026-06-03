import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockBrowserDriver } from "../test-support/mock-browser-driver";
import { defaultPublicState } from "../../src/background/runtime/public-state";
import type { ActiveSession } from "../../src/background/runtime/runtime-session-state";
import type { BrowserObservation } from "../../src/shared/browser-capability-contract";
import type {
  AgentAction,
  CommerceTaskSpec,
  DirectAnswerTaskSpec,
  PublicResearchTaskSpec,
  SessionMemory,
  SiteOverviewTaskSpec,
  SnapshotData,
} from "../../src/shared/agent-domain-model";
import { runRuntimeToolLoop } from "../../src/background/runner/run-runtime-tool-loop";
import { buildRuntimeTaskPlan } from "../../src/background/runner/task-plan-builder";

const { decideRoundActionMock, streamFinalMarkdownMock } = vi.hoisted(() => ({
  decideRoundActionMock: vi.fn(),
  streamFinalMarkdownMock: vi.fn(),
}));

vi.mock("../../src/background/llm/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../../src/background/llm/llm-client")>("../../src/background/llm/llm-client");
  return {
    ...actual,
    decideRoundAction: decideRoundActionMock,
    streamFinalMarkdown: streamFinalMarkdownMock,
  };
});

function createObservation(overrides: Partial<BrowserObservation> = {}): BrowserObservation {
  return {
    tab: {
      tabId: 1,
      url: "https://example.com/",
      title: "Example",
      active: true,
      status: "complete",
    },
    url: "https://example.com/",
    title: "Example",
    mainText: "Example page body with enough detail to create a summary and a couple of facts.",
    links: [],
    controls: [],
    semanticSnapshot: undefined,
    targets: [],
    problems: [],
    truncated: false,
    coverage: {
      mainTextChars: 78,
      linkCount: 0,
      controlCount: 0,
      targetCount: 0,
    },
    ...overrides,
  };
}

function createBaseMemory(taskSpec: SessionMemory["taskSpec"]): SessionMemory {
  return {
    goal: taskSpec?.originalGoal ?? "Test goal",
    taskType: taskSpec?.taskType ?? "direct_answer",
    searchPreference: "auto",
    conversationTurns: [],
    currentTurnId: 1,
    plan: taskSpec ? buildRuntimeTaskPlan(taskSpec) : [],
    taskSpec,
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
      pageType: "unknown",
      status: "idle",
      currentStepId: undefined,
      currentTool: undefined,
      currentStep: 0,
      budgetLow: false,
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

function createSession(memory: SessionMemory): ActiveSession {
  return {
    memory,
    stopped: false,
    abortController: new AbortController(),
    lastPublicState: defaultPublicState(),
  };
}

function createDeps(overrides: Partial<Parameters<typeof runRuntimeToolLoop>[1]> = {}) {
  return {
    publishState: vi.fn(async () => undefined),
    scanPage: vi.fn(async () => {
      throw new Error("scanPage not mocked");
    }),
    ensureUsableSnapshot: vi.fn(async () => {
      throw new Error("ensureUsableSnapshot not mocked");
    }),
    executeAction: vi.fn(async () => {
      throw new Error("executeAction not mocked");
    }),
    settleAfterAction: vi.fn(async () => undefined),
    recordStep: vi.fn(),
    pushState: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createSearchSnapshot(query: string): SnapshotData {
  return {
    url: `https://search.jd.com/Search?keyword=${encodeURIComponent(query)}`,
    title: `${query} - JD Search`,
    pageType: "search",
    interactiveElements: [],
    semanticSnapshot: {
      version: 1,
      url: `https://search.jd.com/Search?keyword=${encodeURIComponent(query)}`,
      title: `${query} - JD Search`,
      nodeCount: 1,
      truncated: false,
      root: { ref: "sem_root", role: "main", name: "", children: [] },
    },
    productCandidates: [],
    pageReady: { ready: true, reason: "ready", checks: [] },
    pageFacts: {
      searchBox: { present: true, visible: true, text: query },
      searchSubmit: { present: true, visible: true, text: "Search" },
      resultList: {
        present: true,
        loaded: true,
        cardCount: 3,
        productLinkCount: 3,
        emptyState: false,
      },
    },
    timestamp: Date.now(),
  };
}

describe("runtime tool loop", () => {
  beforeEach(() => {
    decideRoundActionMock.mockReset();
    streamFinalMarkdownMock.mockReset();
  });

  it("finishes direct_answer without using the browser driver", async () => {
    const taskSpec: DirectAnswerTaskSpec = {
      taskType: "direct_answer",
      originalGoal: "Explain DOM in one sentence.",
      outputMode: "inline",
      routeReason: "stable knowledge",
      currentTimeIso: new Date().toISOString(),
      timezone: "Asia/Shanghai",
      evidenceTurnCount: 0,
    };
    streamFinalMarkdownMock.mockResolvedValue({
      markdown: "DOM is the browser's structured representation of a page.",
      model: "mock-model",
      provider: "openai-compatible",
    });

    const memory = createBaseMemory(taskSpec);
    const session = createSession(memory);
    const deps = createDeps();
    const driver = new MockBrowserDriver();

    await runRuntimeToolLoop(session, deps, { driver });

    expect(session.memory.finalResult?.status).toBe("success");
    expect(session.memory.plan.map((step) => step.status)).toEqual(["succeeded"]);
    expect(driver.calls).toEqual([]);
  });

  it("runs public_research through browser.search, browser.webDetail, and finalization", async () => {
    const taskSpec: PublicResearchTaskSpec = {
      taskType: "public_research",
      originalGoal: "Research OpenAI",
      outputMode: "inline",
      searchQuery: "OpenAI",
      querySource: "rule",
      notes: [],
      searchEngine: "google",
      candidateLimit: 5,
      sourceTargetCount: 2,
    };
    streamFinalMarkdownMock.mockResolvedValue({
      markdown: "OpenAI provides products, docs, and pricing entry points.",
      model: "mock-model",
      provider: "openai-compatible",
    });
    decideRoundActionMock.mockResolvedValue({
      decision: "finalize",
      reason: "现有证据已经足够收尾。",
      source: "llm-lite",
      model: "mock-model",
      provider: "openai-compatible",
    });

    const memory = createBaseMemory(taskSpec);
    const session = createSession(memory);
    const deps = createDeps();
    const driver = new MockBrowserDriver({
      observations: {
        1: createObservation({
          tab: {
            tabId: 1,
            url: "https://www.google.com/search?q=OpenAI",
            title: "OpenAI - Google Search",
            active: true,
            status: "complete",
          },
          url: "https://www.google.com/search?q=OpenAI",
          title: "OpenAI - Google Search",
          mainText: "Search results page",
          links: [
            { text: "OpenAI", url: "https://openai.com/" },
            { text: "Platform Docs", url: "https://platform.openai.com/docs" },
          ],
        }),
        2: createObservation({
          tab: {
            tabId: 2,
            url: "https://openai.com/",
            title: "OpenAI",
            active: true,
            status: "complete",
          },
          url: "https://openai.com/",
          title: "OpenAI",
          mainText: "OpenAI builds products, APIs, and research systems for general users and developers.",
          links: [{ text: "Pricing", url: "https://openai.com/pricing" }],
        }),
        3: createObservation({
          tab: {
            tabId: 3,
            url: "https://platform.openai.com/docs",
            title: "Docs",
            active: true,
            status: "complete",
          },
          url: "https://platform.openai.com/docs",
          title: "Docs",
          mainText: "The docs describe API setup, examples, and platform usage.",
          links: [{ text: "API reference", url: "https://platform.openai.com/docs/api-reference" }],
        }),
      },
    });

    await runRuntimeToolLoop(session, deps, { driver });

    expect(session.memory.finalResult?.summary).toContain("OpenAI provides products");
    expect(session.memory.researchSources).toHaveLength(2);
    expect(session.memory.plan.map((step) => step.status)).toEqual(["succeeded", "succeeded", "succeeded", "succeeded", "succeeded"]);
    expect(driver.calls.map((call) => call.method)).toEqual([
      "openTab",
      "waitForStable",
      "observe",
      "openTab",
      "waitForStable",
      "observe",
      "openTab",
      "waitForStable",
      "observe",
    ]);
  });

  it("runs site_overview resolve_official_home through browser.search and browser.siteOverview", async () => {
    const taskSpec: SiteOverviewTaskSpec = {
      taskType: "site_overview",
      originalGoal: "Summarize the OpenAI site",
      outputMode: "inline",
      entryMode: "resolve_official_home",
      siteName: "OpenAI",
      officialSearchQuery: "OpenAI official website",
      candidateLimit: 5,
      sourceTargetCount: 3,
      pageReadLimit: 3,
      maxLinkDepth: 1,
      minReadableTextLength: 120,
      notes: [],
    };
    streamFinalMarkdownMock.mockResolvedValue({
      markdown: "The OpenAI site exposes product, pricing, and documentation entry points.",
      model: "mock-model",
      provider: "openai-compatible",
    });
    decideRoundActionMock.mockResolvedValue({
      decision: "finalize",
      reason: "站点概览覆盖已足够。",
      source: "llm-lite",
      model: "mock-model",
      provider: "openai-compatible",
    });

    const memory = createBaseMemory(taskSpec);
    const session = createSession(memory);
    const deps = createDeps();
    const driver = new MockBrowserDriver({
      observations: {
        1: createObservation({
          tab: {
            tabId: 1,
            url: "https://www.google.com/search?q=OpenAI+official+website",
            title: "OpenAI official website - Google Search",
            active: true,
            status: "complete",
          },
          url: "https://www.google.com/search?q=OpenAI+official+website",
          title: "OpenAI official website - Google Search",
          mainText: "Search results page",
          links: [
            { text: "OpenAI", url: "https://openai.com/" },
            { text: "Platform Docs", url: "https://platform.openai.com/docs" },
          ],
        }),
        2: createObservation({
          tab: {
            tabId: 2,
            url: "https://openai.com/",
            title: "OpenAI",
            active: true,
            status: "complete",
          },
          url: "https://openai.com/",
          title: "OpenAI",
          mainText: "OpenAI home page",
          links: [
            { text: "Products", url: "https://openai.com/products" },
            { text: "Pricing", url: "https://openai.com/pricing" },
          ],
        }),
        3: createObservation({
          tab: {
            tabId: 3,
            url: "https://openai.com/products",
            title: "Products",
            active: false,
            status: "complete",
          },
          url: "https://openai.com/products",
          title: "Products",
          mainText: "Products page",
          links: [],
        }),
        4: createObservation({
          tab: {
            tabId: 4,
            url: "https://openai.com/pricing",
            title: "Pricing",
            active: false,
            status: "complete",
          },
          url: "https://openai.com/pricing",
          title: "Pricing",
          mainText: "Pricing page",
          links: [],
        }),
      },
    });

    await runRuntimeToolLoop(session, deps, { driver });

    expect(session.memory.taskSpec?.taskType).toBe("site_overview");
    expect((session.memory.taskSpec as SiteOverviewTaskSpec).entryUrl).toBe("https://openai.com/");
    expect(session.memory.researchSources).toHaveLength(3);
    expect(session.memory.plan.map((step) => step.status)).toEqual(["succeeded", "succeeded", "succeeded", "succeeded"]);
    expect(session.memory.finalResult?.summary).toContain("OpenAI site");
  });

  it("runs commerce_search through the wired commerce delegate and finalizer", async () => {
    const taskSpec: CommerceTaskSpec = {
      taskType: "commerce_search",
      originalGoal: "Find a thin laptop under 3000 RMB",
      outputMode: "inline",
      budgetMax: 3000,
      topK: 3,
      llmInputLimit: 3,
      extractLimit: 6,
      searchQuery: "薄本 3000元",
      querySource: "rule",
      notes: [],
    };
    streamFinalMarkdownMock.mockResolvedValue({
      markdown: "Two shortlist items were kept under the budget.",
      model: "mock-model",
      provider: "openai-compatible",
    });
    decideRoundActionMock.mockResolvedValue({
      decision: "finalize",
      reason: "候选商品数量已足够收尾。",
      source: "llm-lite",
      model: "mock-model",
      provider: "openai-compatible",
    });

    const memory = createBaseMemory(taskSpec);
    const session = createSession(memory);
    const searchSnapshot = createSearchSnapshot(taskSpec.searchQuery);
    const deps = createDeps({
      scanPage: vi.fn(async () => searchSnapshot),
      ensureUsableSnapshot: vi.fn(async () => searchSnapshot),
      executeAction: vi.fn(async (action: AgentAction) => {
        if (action.type === "EXTRACT_LIST") {
          return {
            success: true,
            actionType: "EXTRACT_LIST" as const,
            message: "Extracted items",
            items: [
              {
                title: "Mock Laptop A",
                priceText: "2999",
                url: "https://item.jd.com/mock-a.html",
                shopText: "JD Self-operated",
              },
              {
                title: "Mock Laptop B",
                priceText: "2899",
                url: "https://item.jd.com/mock-b.html",
                shopText: "JD Self-operated",
              },
            ],
          };
        }
        throw new Error(`Unexpected action ${action.type}`);
      }),
    });
    const driver = new MockBrowserDriver();

    await runRuntimeToolLoop(session, deps, { driver });

    expect(session.memory.extractedItems).toHaveLength(2);
    expect(session.memory.finalResult?.summary).toContain("Two shortlist items");
    expect(session.memory.plan.map((step) => step.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
  });

  it("does not continue commerce extraction when search preparation is still retryable", async () => {
    const taskSpec: CommerceTaskSpec = {
      taskType: "commerce_search",
      originalGoal: "Find a thin laptop under 3000 RMB",
      outputMode: "inline",
      budgetMax: 3000,
      topK: 3,
      llmInputLimit: 3,
      extractLimit: 6,
      searchQuery: "薄本 3000元",
      querySource: "rule",
      notes: [],
    };
    decideRoundActionMock.mockResolvedValue({
      decision: "abort",
      reason: "搜索页仍未稳定，停止本轮。",
      source: "llm-lite",
      model: "mock-model",
      provider: "openai-compatible",
    });

    const memory = createBaseMemory(taskSpec);
    const session = createSession(memory);
    const unexpectedSnapshot: SnapshotData = {
      url: "https://www.jd.com/",
      title: "JD Home",
      pageType: "content",
      interactiveElements: [],
      semanticSnapshot: {
        version: 1,
        url: "https://www.jd.com/",
        title: "JD Home",
        nodeCount: 1,
        truncated: false,
        root: { ref: "sem_root", role: "main", name: "", children: [] },
      },
      productCandidates: [],
      pageReady: { ready: true, reason: "ready", checks: [] },
      pageFacts: {
        searchBox: { present: false, visible: false, text: "" },
        searchSubmit: { present: false, visible: false, text: "" },
      },
      timestamp: Date.now(),
    };
    const executeAction = vi.fn(async (action: AgentAction) => {
      if (action.type === "NAVIGATE") {
        return {
          success: true,
          actionType: "NAVIGATE" as const,
          message: "navigated",
          navigated: true,
        };
      }

      throw new Error(`Unexpected action ${action.type}`);
    });
    const deps = createDeps({
      scanPage: vi
        .fn()
        .mockResolvedValueOnce(unexpectedSnapshot)
        .mockResolvedValueOnce(unexpectedSnapshot)
        .mockResolvedValueOnce(unexpectedSnapshot),
      ensureUsableSnapshot: vi.fn(async () => unexpectedSnapshot),
      executeAction,
    });
    const driver = new MockBrowserDriver();

    await runRuntimeToolLoop(session, deps, { driver });

    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(executeAction.mock.calls.every(([action]) => action.type === "NAVIGATE")).toBe(true);
    expect(session.memory.extractedItems).toHaveLength(0);
    expect(session.memory.finalResult?.status).toBe("failed");
  });

  it("replans public_research once and then finalizes on the second round", async () => {
    const taskSpec: PublicResearchTaskSpec = {
      taskType: "public_research",
      originalGoal: "Research OpenAI pricing",
      outputMode: "inline",
      searchQuery: "OpenAI pricing",
      querySource: "rule",
      notes: [],
      searchEngine: "google",
      candidateLimit: 4,
      sourceTargetCount: 1,
    };
    streamFinalMarkdownMock.mockResolvedValue({
      markdown: "The second round added a clearer pricing source and the result can now be summarized.",
      model: "mock-model",
      provider: "openai-compatible",
    });
    decideRoundActionMock
      .mockResolvedValueOnce({
        decision: "replan",
        reason: "第一轮证据不足，先缩窄查询再补读一轮。",
        nextRoundSummary: "使用更具体的查询补读来源。",
        taskSpecPatch: {
          searchQuery: "OpenAI pricing official",
          candidateLimit: 5,
          sourceTargetCount: 1,
          notesAppend: ["Round 2 narrow query."],
        },
        source: "llm-lite",
        model: "mock-model",
        provider: "openai-compatible",
      })
      .mockResolvedValueOnce({
        decision: "finalize",
        reason: "第二轮证据已经足够收尾。",
        source: "llm-lite",
        model: "mock-model",
        provider: "openai-compatible",
      });

    const memory = createBaseMemory(taskSpec);
    const session = createSession(memory);
    const deps = createDeps();
    const driver = new MockBrowserDriver({
      observations: {
        1: createObservation({
          tab: { tabId: 1, url: "https://www.google.com/search?q=OpenAI+pricing", title: "Search 1", active: true, status: "complete" },
          url: "https://www.google.com/search?q=OpenAI+pricing",
          title: "Search 1",
          mainText: "Search results page",
          links: [{ text: "OpenAI", url: "https://openai.com/" }],
        }),
        2: createObservation({
          tab: { tabId: 2, url: "https://openai.com/", title: "OpenAI", active: true, status: "complete" },
          url: "https://openai.com/",
          title: "OpenAI",
          mainText: "OpenAI homepage with only partial pricing hints.",
          links: [{ text: "Pricing", url: "https://openai.com/pricing" }],
          problems: [{ code: "empty_content", message: "Homepage alone is weak evidence.", recoverable: true }],
        }),
        3: createObservation({
          tab: { tabId: 3, url: "https://www.google.com/search?q=OpenAI+pricing+official", title: "Search 2", active: true, status: "complete" },
          url: "https://www.google.com/search?q=OpenAI+pricing+official",
          title: "Search 2",
          mainText: "Search results page",
          links: [{ text: "Pricing", url: "https://openai.com/pricing" }],
        }),
        4: createObservation({
          tab: { tabId: 4, url: "https://openai.com/pricing", title: "Pricing", active: true, status: "complete" },
          url: "https://openai.com/pricing",
          title: "Pricing",
          mainText: "Pricing page with clearer pricing entry information for products and plans.",
          links: [],
        }),
      },
    });

    await runRuntimeToolLoop(session, deps, { driver });

    expect(decideRoundActionMock).toHaveBeenCalledTimes(2);
    expect((session.memory.taskSpec as PublicResearchTaskSpec).searchQuery).toBe("OpenAI pricing official");
    expect(session.memory.runtimeMeta.currentRound).toBe(2);
    expect(session.memory.finalResult?.summary).toContain("second round");
    expect(driver.calls.map((call) => call.method)).toEqual([
      "openTab",
      "waitForStable",
      "observe",
      "openTab",
      "waitForStable",
      "observe",
      "openTab",
      "waitForStable",
      "observe",
      "openTab",
      "waitForStable",
      "observe",
    ]);
  });

  it("finalizes instead of starting a third round when maxRounds is reached", async () => {
    const taskSpec: PublicResearchTaskSpec = {
      taskType: "public_research",
      originalGoal: "Research OpenAI pricing",
      outputMode: "inline",
      searchQuery: "OpenAI pricing official",
      querySource: "rule",
      notes: [],
      searchEngine: "google",
      candidateLimit: 4,
      sourceTargetCount: 1,
    };
    streamFinalMarkdownMock.mockResolvedValue({
      markdown: "Use the current pricing source instead of replanning again.",
      model: "mock-model",
      provider: "openai-compatible",
    });
    decideRoundActionMock.mockResolvedValue({
      decision: "replan",
      reason: "LLM requested another round even though the max round is already reached.",
      nextRoundSummary: "Try a third round.",
      taskSpecPatch: {
        searchQuery: "OpenAI pricing third round",
        notesAppend: ["Should not be applied."],
      },
      source: "llm-lite",
      model: "mock-model",
      provider: "openai-compatible",
    });

    const memory = createBaseMemory(taskSpec);
    memory.runtimeMeta.currentRound = 2;
    memory.runtimeMeta.maxRounds = 2;
    const session = createSession(memory);
    const deps = createDeps();
    const driver = new MockBrowserDriver({
      observations: {
        1: createObservation({
          tab: { tabId: 1, url: "https://www.google.com/search?q=OpenAI+pricing+official", title: "Search", active: true, status: "complete" },
          url: "https://www.google.com/search?q=OpenAI+pricing+official",
          title: "Search",
          mainText: "Search results page",
          links: [{ text: "Pricing", url: "https://openai.com/pricing" }],
        }),
        2: createObservation({
          tab: { tabId: 2, url: "https://openai.com/pricing", title: "Pricing", active: true, status: "complete" },
          url: "https://openai.com/pricing",
          title: "Pricing",
          mainText: "Pricing page with enough information to summarize the current source.",
          links: [],
        }),
      },
    });

    await runRuntimeToolLoop(session, deps, { driver });

    expect(decideRoundActionMock).toHaveBeenCalledTimes(1);
    expect((session.memory.taskSpec as PublicResearchTaskSpec).searchQuery).toBe("OpenAI pricing official");
    expect(session.memory.runtimeMeta.currentRound).toBe(2);
    expect(session.memory.finalResult?.summary).toContain("current pricing source");
    expect(session.memory.unresolvedIssues).toContain(
      "Max runtime rounds reached; ignored an extra replan request. LLM requested another round even though the max round is already reached.",
    );
    expect(driver.calls.filter((call) => call.method === "openTab")).toHaveLength(2);
  });
});
