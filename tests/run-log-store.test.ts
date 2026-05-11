import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebugLogEntry, SessionMemory } from "../src/shared/agent-domain-model";

const storageState: Record<string, unknown> = {};

function createMemory(): SessionMemory {
  return {
    goal: "Inspect session debug logging",
    taskType: "public_research",
    searchPreference: "auto",
    conversationTurns: [],
    plan: [],
    taskSpec: {
      taskType: "public_research",
      originalGoal: "Inspect session debug logging",
      outputMode: "inline",
      searchQuery: "session debug logging",
      querySource: "rule",
      notes: [],
      searchEngine: "google",
      candidateLimit: 5,
      sourceTargetCount: 3,
    },
    toolHistory: [],
    currentFacts: {},
    stepHistory: [
      {
        step: 1,
        status: "done",
        stepSummary: "Search completed.",
        timestamp: Date.now(),
      },
    ],
    logs: [],
    rawExtractedItems: [],
    extractedItems: [],
    researchCandidates: [],
    researchSources: [],
    filterDiagnostics: {
      kind: "research",
      inputCount: 5,
      dedupedCount: 4,
      finalCount: 3,
      skippedAdCount: 1,
      skippedInternalCount: 0,
      skippedDuplicateCount: 1,
      skippedPdfCount: 0,
      skippedInvalidCount: 0,
    },
    liveStepSummary: "Search completed.",
    nextIntent: "Finalize result",
    failures: [],
    unresolvedIssues: ["Need one more source"],
    activeSourceIndex: 0,
    finalResult: {
      outputMode: "inline",
      status: "partial",
      summary: "Need another source before finalizing.",
      markdown: "Need another source before finalizing.",
      keyResults: [],
      completedSteps: [],
      remainingOrFailedSteps: [],
      errorsOrBlockers: ["Need another source"],
      artifacts: [],
      suggestedNextAction: "Run one more round.",
    },
    runtimeMeta: {
      sessionId: "session-debug-1",
      tabId: 1,
      pageType: "google_search",
      status: "done",
      currentStepId: "prepareTaskCandidates",
      currentTool: "prepareTaskCandidates",
      currentStep: 1,
      budgetLow: false,
      actionRetryCount: 0,
      recoveryCount: 0,
      pageWaitRecoveryCount: 0,
      dialogCloseRecoveryCount: 0,
      searchReopenRecoveryCount: 0,
      queryRefineTried: false,
      sameToolRetryCount: 0,
      consecutiveNoProgressCount: 0,
      currentRound: 1,
      maxRounds: 2,
      startedAt: Date.now() - 5_000,
    },
  };
}

describe("run log store", () => {
  beforeEach(() => {
    for (const key of Object.keys(storageState)) {
      delete storageState[key];
    }

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
            const entries = Array.isArray(keys) ? keys : [keys];
            for (const key of entries) {
              delete storageState[key];
            }
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists log entries and exports a debug bundle", async () => {
    const {
      appendSessionRunLogEntry,
      deleteSessionRunLog,
      exportSessionDebugBundle,
      loadSessionRunLog,
      saveSessionRunDebugSnapshot,
    } = await import("../src/background/runtime/run-log-store");

    const memory = createMemory();
    await appendSessionRunLogEntry(memory.runtimeMeta.sessionId, {
      timestamp: Date.now(),
      source: "runtime",
      level: "info",
      message: "Round completed.",
      detail: "done",
      stepId: "prepareTaskCandidates",
      toolName: "prepareTaskCandidates",
      round: 1,
    });
    await saveSessionRunDebugSnapshot(memory);

    const stored = await loadSessionRunLog(memory.runtimeMeta.sessionId);
    expect(stored?.runLogs).toHaveLength(1);
    expect(stored?.runLogs[0]?.toolName).toBe("prepareTaskCandidates");
    expect(stored?.finalResult?.status).toBe("partial");

    const bundle = await exportSessionDebugBundle(memory.runtimeMeta.sessionId);
    expect(bundle?.sessionId).toBe(memory.runtimeMeta.sessionId);
    expect(bundle?.taskType).toBe("public_research");
    expect(bundle?.unresolvedIssues).toContain("Need one more source");

    await deleteSessionRunLog(memory.runtimeMeta.sessionId);
    expect(await loadSessionRunLog(memory.runtimeMeta.sessionId)).toBeUndefined();
  });

  it("merges stored logs with live memory logs when saving a terminal snapshot", async () => {
    const {
      appendSessionRunLogEntry,
      loadSessionRunLog,
      saveSessionRunDebugSnapshot,
    } = await import("../src/background/runtime/run-log-store");

    const memory = createMemory();
    const storedEntry: DebugLogEntry = {
      timestamp: 1_000,
      source: "runtime",
      level: "info",
      message: "Stored before snapshot.",
      stepId: "browser-search",
      toolName: "browser.search",
      round: 1,
    };
    const liveEntry: DebugLogEntry = {
      timestamp: 1_001,
      source: "llm",
      level: "warn",
      message: "Live tail before terminal snapshot.",
      stepId: "decide-round-action",
      toolName: "decideRoundAction",
      round: 1,
    };

    await appendSessionRunLogEntry(memory.runtimeMeta.sessionId, storedEntry);
    memory.logs = [storedEntry, liveEntry];
    await saveSessionRunDebugSnapshot(memory);

    const stored = await loadSessionRunLog(memory.runtimeMeta.sessionId);
    expect(stored?.runLogs.map((entry) => entry.message)).toEqual([
      "Stored before snapshot.",
      "Live tail before terminal snapshot.",
    ]);
  });
});
