import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPublicState } from "../src/shared/types";

const storageState: Record<string, unknown> = {};

function createStoredState(sessionId: string, goal: string, summary: string): SessionPublicState {
  return {
    sessionId,
    goal,
    status: "done",
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

function createArchiveInput(state: SessionPublicState, conversationId: string, conversationTitle: string) {
  return {
    sessionId: state.sessionId!,
    goal: state.goal!,
    finalResult: state.finalResult!,
    conversationId,
    conversationTitle,
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
      saveSessionArchive,
    } = await import("../src/background/runtime/session-archive");

    const emptyFallback: SessionPublicState = {
      status: "idle",
      updatedAt: Date.now(),
    };

    const conversation = await createConversation("Recent gold");
    await saveSessionArchive(
      createArchiveInput(createStoredState("session-1", "Recent gold", "Gold moved up recently"), conversation.conversationId, conversation.title),
    );
    await saveSessionArchive(
      createArchiveInput(
        createStoredState("session-2", "Is gold tied to recent wars?", "War is one of the risk-off factors"),
        conversation.conversationId,
        conversation.title,
      ),
    );
    const current = await loadConversationBackfillState(emptyFallback);
    expect(current.conversationId).toBe(conversation.conversationId);
    expect(current.conversationTurns).toHaveLength(2);
    expect(current.conversationTurns?.[0]?.turnId).toBe(1);
    expect(current.conversationTurns?.[1]?.turnId).toBe(2);
    expect("timeline" in current.conversationTurns![0]!).toBe(false);
    expect(current.finalResult?.summary).toBe("War is one of the risk-off factors");

    const rolledBack = await rollbackConversationState(conversation.conversationId, 1, emptyFallback);
    expect(rolledBack.conversationTurns).toHaveLength(1);
    expect(rolledBack.conversationTurns?.[0]?.turnId).toBe(1);
    expect(rolledBack.finalResult?.summary).toBe("Gold moved up recently");

    const deleted = await deleteConversationState(conversation.conversationId, emptyFallback);
    expect(deleted.conversationId).toBeUndefined();
    expect(deleted.conversationTurns).toEqual([]);
    expect(deleted.availableConversations).toEqual([]);
  });

  it("stores terminal non-success turns in the conversation archive", async () => {
    const { createConversation, loadConversationBackfillState, saveSessionArchive } = await import("../src/background/runtime/session-archive");

    const fallback: SessionPublicState = {
      status: "idle",
      updatedAt: Date.now(),
    };

    const conversation = await createConversation("Partial research");
    const partialState = createStoredState("session-partial", "Partial research", "Need another round");
    partialState.finalResult = {
      ...partialState.finalResult!,
      status: "partial",
      errorsOrBlockers: ["Coverage was insufficient."],
    };

    await saveSessionArchive(createArchiveInput(partialState, conversation.conversationId, conversation.title));

    const current = await loadConversationBackfillState(fallback);
    expect(current.conversationTurns).toHaveLength(1);
    expect(current.finalResult?.status).toBe("partial");
    expect(current.finalResult?.summary).toBe("Need another round");
  });

  it("ignores legacy V1 archive keys after the V2 storage upgrade", async () => {
    const { loadConversationBackfillState } = await import("../src/background/runtime/session-archive");

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
      updatedAt: Date.now(),
    });

    expect(fallback.conversationId).toBeUndefined();
    expect(fallback.conversationTurns).toEqual([]);
    expect(fallback.availableConversations).toEqual([]);
  });
});
