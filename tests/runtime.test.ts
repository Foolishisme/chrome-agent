import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateRuntimeBudget, isReceiverMissingError, sendMessageToTab } from "../src/background/runtime";
import { LIMITS } from "../src/shared/constants";
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
