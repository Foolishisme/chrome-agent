import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../src/shared/agent-runtime-config";
import type { DebugLogEntry, SessionDebugBundle, SessionMemory } from "../src/shared/agent-domain-model";
import type { ActiveSession } from "../src/background/runtime/runtime-session-state";

const { createInitialSessionMock, runRuntimeToolLoopMock } = vi.hoisted(() => ({
  createInitialSessionMock: vi.fn(),
  runRuntimeToolLoopMock: vi.fn(),
}));

vi.mock("../src/background/runtime/session-bootstrap", async () => {
  const actual = await vi.importActual<typeof import("../src/background/runtime/session-bootstrap")>("../src/background/runtime/session-bootstrap");
  return {
    ...actual,
    createInitialSession: createInitialSessionMock,
  };
});

vi.mock("../src/background/runner/run-runtime-tool-loop", async () => {
  const actual = await vi.importActual<typeof import("../src/background/runner/run-runtime-tool-loop")>("../src/background/runner/run-runtime-tool-loop");
  return {
    ...actual,
    runRuntimeToolLoop: runRuntimeToolLoopMock,
  };
});

import { BrowserAgentRuntime, evaluateRuntimeBudget, isReceiverMissingError, sendMessageToTab } from "../src/background/runtime/agent-runtime";
import { ensureTerminalResult, toPublicState } from "../src/background/runtime/public-state";

function createMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  const memory: SessionMemory = {
    goal: "Research the difference between Playwright and Selenium",
    taskType: "public_research",
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
      pageType: "unknown",
      status: "running",
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
    ...overrides,
  };
  memory.searchPreference = overrides.searchPreference ?? "auto";
  memory.conversationTurns = overrides.conversationTurns ?? [];
  return memory;
}

function createSession(memory: SessionMemory) {
  return {
    memory,
    stopped: false,
    abortController: new AbortController(),
    lastPublicState: {
      status: "running" as const,
      updatedAt: Date.now(),
    },
  };
}

describe("runtime messaging recovery", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    createInitialSessionMock.mockReset();
    runRuntimeToolLoopMock.mockReset();
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

  it("publishes streaming final drafts only while running and clears them on terminal fallback", () => {
    const memory = createMemory({
      streamingFinalDraft: {
        markdown: "## 结论\n正在生成。",
        updatedAt: Date.now(),
      },
    });

    expect(toPublicState(memory).streamingFinalDraft?.markdown).toContain("正在生成");

    ensureTerminalResult(memory, "Stopped.", "partial");

    expect(memory.streamingFinalDraft).toBeUndefined();
    expect(toPublicState(memory).streamingFinalDraft).toBeUndefined();
  });
});

describe("runtime run log export", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges persisted run logs with the active session live tail", async () => {
    const storageState: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            if (typeof keys === "string") {
              return { [keys]: storageState[keys] };
            }

            return keys.reduce<Record<string, unknown>>((acc, key) => {
              acc[key] = storageState[key];
              return acc;
            }, {});
          }),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(storageState, value);
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete storageState[key];
            }
          }),
        },
      },
    });

    const { appendSessionRunLogEntry } = await import("../src/background/runtime/run-log-store");
    const storedEntry: DebugLogEntry = {
      timestamp: 2_000,
      source: "runtime",
      level: "info",
      message: "Stored log.",
      stepId: "browser-search",
      toolName: "browser.search",
      round: 1,
    };
    const liveEntry: DebugLogEntry = {
      timestamp: 2_001,
      source: "llm",
      level: "warn",
      message: "Live log.",
      stepId: "decide-round-action",
      toolName: "decideRoundAction",
      round: 1,
    };

    const memory = createMemory({
      logs: [storedEntry, liveEntry],
      runtimeMeta: {
        ...createMemory().runtimeMeta,
        sessionId: "active-session",
      },
    });
    await appendSessionRunLogEntry(memory.runtimeMeta.sessionId, storedEntry);

    const runtime = new BrowserAgentRuntime() as unknown as {
      activeSession?: ActiveSession;
      getSessionRunLog(sessionId?: string): Promise<DebugLogEntry[]>;
      exportSessionDebugBundle(sessionId?: string): Promise<SessionDebugBundle | undefined>;
    };
    runtime.activeSession = createSession(memory);

    await expect(runtime.getSessionRunLog(memory.runtimeMeta.sessionId)).resolves.toEqual([
      storedEntry,
      liveEntry,
    ]);
    await expect(runtime.exportSessionDebugBundle(memory.runtimeMeta.sessionId)).resolves.toMatchObject({
      sessionId: "active-session",
      runLogs: [storedEntry, liveEntry],
    });
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
      ensureUsableSnapshot(session: ReturnType<typeof createSession>): Promise<unknown>;
      scanPage: ReturnType<typeof vi.fn>;
    };
    const memory = createMemory();
    const session = createSession(memory);
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
      ensureUsableSnapshot(session: ReturnType<typeof createSession>): Promise<unknown>;
      scanPage: ReturnType<typeof vi.fn>;
    };
    const memory = createMemory();
    const session = createSession(memory);
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
    const rejection = expect(pending).rejects.toMatchObject({
      code: "PAGE_NOT_READY",
    });
    await vi.advanceTimersByTimeAsync(LIMITS.PAGE_READY_WAIT_MS + LIMITS.PAGE_READY_SECOND_WAIT_MS);
    await rejection;

    expect(memory.runtimeMeta.pageWaitRecoveryCount).toBe(2);
    expect(memory.recoveryHint).toContain("wait recovery 2/2");
    expect(runtime.scanPage).toHaveBeenCalledTimes(3);
  });
});

describe("runtime tool loop orchestration", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("dispatches runSession to the runtime tool loop", async () => {
    const memory = createMemory({
      taskType: "public_research",
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research OpenAI",
        outputMode: "inline",
        searchQuery: "OpenAI",
        querySource: "rule",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
      plan: [
        {
          stepId: "browser-search",
          goal: "Collect first-page source candidates.",
          allowedTools: ["browser.search"],
          successCriteria: [],
          status: "pending",
        },
      ],
      runtimeMeta: {
        ...createMemory().runtimeMeta,
        status: "idle",
      },
    });
    const session = createSession(memory);
    runRuntimeToolLoopMock.mockImplementation(async (currentSession: ActiveSession, deps: { publishState: (session: ActiveSession) => Promise<void> }) => {
      currentSession.memory.runtimeMeta.status = "done";
      currentSession.memory.finalResult = {
        outputMode: "inline",
        status: "partial",
        summary: "Done",
        markdown: "Done",
        keyResults: [],
        completedSteps: [],
        remainingOrFailedSteps: [],
        errorsOrBlockers: [],
        artifacts: [],
        suggestedNextAction: "None",
      };
      await deps.publishState(currentSession);
    });

    const runtime = new BrowserAgentRuntime() as unknown as {
      runSession(session: ActiveSession): Promise<void>;
      activeSession?: ActiveSession;
      getState(): { status: string; finalResult?: { summary: string } };
    };
    runtime.activeSession = session;
    await runtime.runSession(session);

    expect(runRuntimeToolLoopMock).toHaveBeenCalledOnce();
    expect(runtime.getState().status).toBe("done");
    expect(runtime.getState().finalResult?.summary).toBe("Done");
  });
});
