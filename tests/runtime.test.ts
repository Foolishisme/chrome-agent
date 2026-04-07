import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserAgentRuntime, evaluateRuntimeBudget, isReceiverMissingError, sendMessageToTab } from "../src/background/runtime";
import { LIMITS } from "../src/shared/constants";
import { RuntimeError } from "../src/shared/errors";
import type { SessionMemory } from "../src/shared/types";

function createMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    goal: "调研 Playwright 和 Selenium 的区别",
    taskType: "public_research",
    currentPhase: "planning",
    plan: [],
    subtaskResults: [],
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
      status: "planning",
      currentStepId: undefined,
      currentTool: undefined,
      currentStep: 0,
      budgetLow: false,
      llmRetryCount: 0,
      actionRetryCount: 0,
      pageReadyRetryCount: 0,
      recoveryCount: 0,
      pageWaitRecoveryCount: 0,
      dialogCloseRecoveryCount: 0,
      searchReopenRecoveryCount: 0,
      queryRefineTried: false,
      startedAt: Date.now(),
    },
    ...overrides,
  };
}

describe("runtime messaging recovery", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects the missing receiver error", () => {
    expect(isReceiverMissingError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true);
    expect(isReceiverMissingError(new Error("some other error"))).toBe(false);
  });

  it("falls back to the direct bridge when the receiver is missing", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."));
    const executeScript = vi.fn().mockResolvedValueOnce([{ result: { ok: true, snapshot: { title: "ready" } } }]);
    const getURL = vi.fn().mockReturnValue("chrome-extension://test-id/content-bridge.js");

    vi.stubGlobal("chrome", {
      tabs: {
        sendMessage,
      },
      scripting: {
        executeScript,
      },
      runtime: {
        getURL,
      },
    });

    const response = await sendMessageToTab<{ ok: true; snapshot: { title: string } }>(7, {
      type: "REQUEST_SNAPSHOT",
    });

    expect(response.snapshot.title).toBe("ready");
    expect(getURL).toHaveBeenCalledWith("content-bridge.js");
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 7 },
        args: ["chrome-extension://test-id/content-bridge.js", { type: "REQUEST_SNAPSHOT" }],
      }),
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("marks the budget as low when the soft step limit is reached", () => {
    const now = Date.now();
    const budget = evaluateRuntimeBudget(
      createMemory({
        runtimeMeta: {
          ...createMemory().runtimeMeta,
          currentStep: LIMITS.SOFT_STEP_LIMIT,
          startedAt: now - 30_000,
        },
      }),
      now,
    );

    expect(budget.budgetLow).toBe(true);
    expect(budget.hardStopReason).toBeUndefined();
  });

  it("marks the budget as low when the soft elapsed threshold is reached", () => {
    const now = Date.now();
    const budget = evaluateRuntimeBudget(
      createMemory({
        runtimeMeta: {
          ...createMemory().runtimeMeta,
          currentStep: 3,
          startedAt: now - LIMITS.SOFT_ELAPSED_MS,
        },
      }),
      now,
    );

    expect(budget.budgetLow).toBe(true);
    expect(budget.hardStopReason).toBeUndefined();
  });

  it("hard stops when the total runtime duration is exceeded", () => {
    const now = Date.now();
    const budget = evaluateRuntimeBudget(
      createMemory({
        runtimeMeta: {
          ...createMemory().runtimeMeta,
          currentStep: 3,
          startedAt: now - LIMITS.MAX_ELAPSED_MS,
        },
      }),
      now,
    );

    expect(budget.hardStopCode).toBe("MAX_ELAPSED_REACHED");
  });
});

describe("runtime page wait recovery", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("rescans once and continues when the page becomes ready", async () => {
    vi.useFakeTimers();
    const runtime = new BrowserAgentRuntime() as unknown as {
      ensureUsableSnapshot(session: { memory: SessionMemory; lastPublicState: unknown }): Promise<unknown>;
      scanPage: ReturnType<typeof vi.fn>;
    };
    const memory = createMemory();
    const session = {
      memory,
      lastPublicState: {
        status: "observing",
        currentStep: 0,
        plan: [],
        items: [],
        logs: [],
        timeline: [],
        updatedAt: Date.now(),
      },
    };
    runtime.scanPage = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://example.com/loading",
        title: "Loading",
        pageType: "content",
        interactiveElements: [],
        semanticSnapshot: {
          version: 1,
          url: "https://example.com/loading",
          title: "Loading",
          nodeCount: 1,
          truncated: false,
          root: { ref: "sem_root", role: "unknown", name: "", children: [] },
        },
        productCandidates: [],
        pageReady: { ready: false, reason: "still loading", checks: ["loading"] },
        pageFacts: {
          searchBox: { present: false, visible: false, text: "" },
          searchSubmit: { present: false, visible: false, text: "" },
        },
        timestamp: Date.now(),
      })
      .mockResolvedValueOnce({
        url: "https://example.com/ready",
        title: "Ready",
        pageType: "content",
        interactiveElements: [],
        semanticSnapshot: {
          version: 1,
          url: "https://example.com/ready",
          title: "Ready",
          nodeCount: 1,
          truncated: false,
          root: { ref: "sem_root", role: "unknown", name: "", children: [] },
        },
        productCandidates: [],
        pageReady: { ready: true, reason: "ready", checks: [] },
        pageFacts: {
          searchBox: { present: false, visible: false, text: "" },
          searchSubmit: { present: false, visible: false, text: "" },
        },
        timestamp: Date.now(),
      });

    const pending = runtime.ensureUsableSnapshot(session);
    await vi.advanceTimersByTimeAsync(LIMITS.PAGE_READY_WAIT_MS);
    const snapshot = await pending;

    expect(memory.runtimeMeta.pageWaitRecoveryCount).toBe(0);
    expect(memory.recoveryHint).toBeUndefined();
    expect((snapshot as { pageReady: { ready: boolean } }).pageReady.ready).toBe(true);
    expect(runtime.scanPage).toHaveBeenCalledTimes(2);
  });

  it("throws PAGE_NOT_READY after two short wait rescans", async () => {
    vi.useFakeTimers();
    const runtime = new BrowserAgentRuntime() as unknown as {
      ensureUsableSnapshot(session: { memory: SessionMemory; lastPublicState: unknown }): Promise<unknown>;
      scanPage: ReturnType<typeof vi.fn>;
    };
    const memory = createMemory();
    const session = {
      memory,
      lastPublicState: {
        status: "observing",
        currentStep: 0,
        plan: [],
        items: [],
        logs: [],
        timeline: [],
        updatedAt: Date.now(),
      },
    };
    runtime.scanPage = vi.fn().mockResolvedValue({
      url: "https://example.com/loading",
      title: "Loading",
      pageType: "content",
      interactiveElements: [],
      semanticSnapshot: {
        version: 1,
        url: "https://example.com/loading",
        title: "Loading",
        nodeCount: 1,
        truncated: false,
        root: { ref: "sem_root", role: "unknown", name: "", children: [] },
      },
      productCandidates: [],
      pageReady: { ready: false, reason: "still loading", checks: ["loading"] },
      pageFacts: {
        searchBox: { present: false, visible: false, text: "" },
        searchSubmit: { present: false, visible: false, text: "" },
      },
      timestamp: Date.now(),
    });

    const pending = runtime.ensureUsableSnapshot(session);
    const rejection = expect(pending).rejects.toMatchObject<Partial<RuntimeError>>({
      code: "PAGE_NOT_READY",
    });
    await vi.advanceTimersByTimeAsync(LIMITS.PAGE_READY_WAIT_MS + LIMITS.PAGE_READY_SECOND_WAIT_MS);
    await rejection;

    expect(memory.runtimeMeta.pageWaitRecoveryCount).toBe(2);
    expect(memory.recoveryHint).toContain("wait recovery 2/2");
    expect(runtime.scanPage).toHaveBeenCalledTimes(3);
  });
});
