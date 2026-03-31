import { describe, expect, it } from "vitest";
import { ensureDoneAllowed, isRepeatedAction } from "../src/background/guards";
import type { LlmDecision, SessionMemory } from "../src/shared/types";

function createMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    goal: "Find laptops",
    plan: [],
    stepHistory: [],
    extractedItems: [],
    runtimeMeta: {
      sessionId: "session-1",
      tabId: 1,
      pageType: "search",
      status: "observing",
      currentStep: 2,
      llmRetryCount: 0,
      actionRetryCount: 0,
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
});
