import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPublicState } from "../src/shared/types";

const storageState: Record<string, unknown> = {};

function createStoredState(sessionId: string, goal: string, summary: string): SessionPublicState {
  return {
    sessionId,
    goal,
    status: "done",
    currentStep: 3,
    plan: [],
    items: [],
    logs: [],
    timeline: [
      {
        step: 1,
        status: "done",
        stepSummary: `${goal} timeline`,
        timestamp: Date.now(),
      },
    ],
    updatedAt: Date.now(),
    finalResult: {
      outputMode: "inline",
      status: "success",
      summary,
      markdown: `# ${summary}`,
      keyResults: [],
      completedSteps: [],
      remainingOrFailedSteps: [],
      errorsOrBlockers: [],
      artifacts: [],
      suggestedNextAction: "",
    },
  };
}

describe("session archive", () => {
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

  it("stores successful turns by conversation, rolls back, and deletes the conversation", async () => {
    const {
      createConversation,
      deleteConversationState,
      loadConversationBackfillState,
      rollbackConversationState,
      saveSuccessfulSessionArchive,
    } = await import("../src/background/session-archive");

    const emptyFallback: SessionPublicState = {
      status: "idle",
      currentStep: 0,
      plan: [],
      items: [],
      logs: [],
      timeline: [],
      updatedAt: Date.now(),
    };

    const conversation = await createConversation("近期黄金");
    await saveSuccessfulSessionArchive(createStoredState("session-1", "近期黄金", "黄金近期波动上行。"), {
      conversationId: conversation.conversationId,
      conversationTitle: conversation.title,
    });
    await saveSuccessfulSessionArchive(createStoredState("session-2", "黄金是否与近期战争有关", "战争是避险情绪因素之一。"), {
      conversationId: conversation.conversationId,
      conversationTitle: conversation.title,
    });

    const current = await loadConversationBackfillState(emptyFallback);
    expect(current.conversationId).toBe(conversation.conversationId);
    expect(current.conversationTurns).toHaveLength(2);
    expect(current.conversationTurns?.[0]?.turnId).toBe(1);
    expect(current.conversationTurns?.[1]?.turnId).toBe(2);
    expect(current.conversationTurns?.[0]?.timeline).toHaveLength(1);
    expect(current.conversationTurns?.[1]?.timeline?.[0]?.stepSummary).toContain("timeline");
    expect(current.finalResult?.summary).toBe("战争是避险情绪因素之一。");

    const rolledBack = await rollbackConversationState(conversation.conversationId, 1, emptyFallback);
    expect(rolledBack.conversationTurns).toHaveLength(1);
    expect(rolledBack.conversationTurns?.[0]?.turnId).toBe(1);
    expect(rolledBack.finalResult?.summary).toBe("黄金近期波动上行。");

    const deleted = await deleteConversationState(conversation.conversationId, emptyFallback);
    expect(deleted.conversationId).toBeUndefined();
    expect(deleted.conversationTurns).toEqual([]);
    expect(deleted.availableConversations).toEqual([]);
  });

  it("ignores legacy V1 archive keys after the V2 storage upgrade", async () => {
    const { loadConversationBackfillState } = await import("../src/background/session-archive");

    storageState["conversationArchiveIndexV1"] = ["legacy-conversation"];
    storageState["activeConversationIdV1"] = "legacy-conversation";
    storageState["conversationArchive:legacy-conversation"] = {
      conversationId: "legacy-conversation",
      title: "legacy",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nextTurnId: 2,
      turns: [
        {
          turnId: 1,
          sessionId: "legacy-session",
          goal: "legacy goal",
          answerSummary: "legacy answer",
          answerMarkdown: "legacy answer",
          timeline: [],
          savedAt: Date.now(),
          state: createStoredState("legacy-session", "legacy goal", "legacy answer"),
        },
      ],
    };

    const fallback = await loadConversationBackfillState({
      status: "idle",
      currentStep: 0,
      plan: [],
      items: [],
      logs: [],
      timeline: [],
      updatedAt: Date.now(),
    });

    expect(fallback.conversationId).toBeUndefined();
    expect(fallback.conversationTurns).toEqual([]);
    expect(fallback.availableConversations).toEqual([]);
  });
});
