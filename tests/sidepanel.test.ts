import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary, ConversationTurn, SessionPublicState } from "../src/shared/types";

type RuntimeMessage = {
  type: string;
  payload?: SessionPublicState;
};

let onRuntimeMessage: ((message: RuntimeMessage) => void) | undefined;

const conversationSummaries: ConversationSummary[] = [
  {
    conversationId: "conversation-1",
    title: "近期黄金",
    turnCount: 2,
    updatedAt: Date.now(),
  },
];

function createTurnTimeline(stepSummary: string) {
  return [
    {
      step: 1,
      status: "done" as const,
      stepSummary,
      timestamp: Date.now(),
    },
  ];
}

function createConversationTurns(): ConversationTurn[] {
  return [
    {
      turnId: 1,
      sessionId: "session-1",
      goal: "近期黄金",
      answerSummary: "黄金近期波动上行。",
      answerMarkdown: "## 结论\n黄金近期波动上行。",
      timeline: createTurnTimeline("Gold trend timeline"),
      savedAt: Date.now() - 5_000,
    },
    {
      turnId: 2,
      sessionId: "session-2",
      goal: "黄金是否与近期战争有关？",
      answerSummary: "战争是避险情绪因素之一。",
      answerMarkdown: "## 结论\n战争是避险情绪因素之一。",
      timeline: createTurnTimeline("War factor timeline"),
      savedAt: Date.now(),
    },
  ];
}

function createRunningState(): SessionPublicState {
  return {
    conversationId: "conversation-1",
    conversationTitle: "近期黄金",
    conversationTurns: createConversationTurns(),
    availableConversations: conversationSummaries,
    sessionId: "session-running",
    goal: "黄金是否与近期战争有关？",
    status: "running",
    currentStep: 1,
    currentStepId: "collectResearchCandidates",
    currentTool: "collectResearchCandidates",
    stepSummary: "Collecting source candidates.",
    plan: [],
    items: [],
    logs: [],
    timeline: [
      {
        step: 1,
        status: "running",
        stepSummary: "Collecting source candidates.",
        action: {
          type: "NAVIGATE",
          url: "https://www.google.com/search?q=test",
        },
        actionResult: {
          success: true,
          actionType: "NAVIGATE",
          message: "Opened Google search.",
        },
        timestamp: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  };
}

function createArtifactState(): SessionPublicState {
  return {
    conversationId: "conversation-1",
    conversationTitle: "近期黄金",
    conversationTurns: createConversationTurns(),
    availableConversations: conversationSummaries,
    sessionId: "session-artifact",
    goal: "黄金是否与近期战争有关？",
    status: "done",
    currentStep: 4,
    plan: [],
    items: [],
    logs: [],
    timeline: [],
    updatedAt: Date.now(),
    finalResult: {
      outputMode: "artifact",
      status: "success",
      summary: "Collected a usable result.",
      markdown: "",
      keyResults: ["Collected a usable result."],
      completedSteps: ["finalizeResearchResult"],
      remainingOrFailedSteps: [],
      errorsOrBlockers: [],
      artifacts: [
        {
          id: "research-result-markdown",
          kind: "markdown",
          title: "Research Result Report",
          fileName: "research-result.md",
          mimeType: "text/markdown",
          content: "## Summary\nCollected a usable result.",
          summary: "Collected a usable result.",
        },
      ],
      suggestedNextAction: "Review the cited sources if you need deeper follow-up.",
    },
  };
}

function createInlineState(): SessionPublicState {
  return {
    conversationId: "conversation-1",
    conversationTitle: "近期黄金",
    conversationTurns: createConversationTurns(),
    availableConversations: conversationSummaries,
    sessionId: "session-inline",
    goal: "黄金是否与近期战争有关？",
    status: "done",
    currentStep: 4,
    plan: [],
    items: [],
    logs: [],
    timeline: [
      {
        step: 4,
        status: "done",
        stepSummary: "Final result is ready.",
        timestamp: Date.now(),
      },
    ],
    updatedAt: Date.now(),
    finalResult: {
      outputMode: "inline",
      status: "success",
      summary: "Collected a usable result.",
      markdown: "## Summary\nCollected a usable result.",
      keyResults: ["Collected a usable result."],
      completedSteps: ["finalizeResearchResult"],
      remainingOrFailedSteps: [],
      errorsOrBlockers: [],
      artifacts: [],
      suggestedNextAction: "Review the cited sources if you need deeper follow-up.",
    },
  };
}

function createFailedState(): SessionPublicState {
  return {
    conversationId: "conversation-1",
    conversationTitle: "近期黄金",
    conversationTurns: createConversationTurns(),
    availableConversations: conversationSummaries,
    sessionId: "session-failed",
    goal: "Will source reading fail?",
    status: "error",
    currentStep: 3,
    currentStepId: "readResearchSourceFacts",
    currentTool: "readResearchSourceFacts",
    stepSummary: "Source reading failed.",
    plan: [],
    items: [],
    logs: [],
    timeline: [
      {
        step: 3,
        status: "error",
        stepSummary: "Source reading failed.",
        timestamp: Date.now(),
      },
    ],
    error: "Source reading failed.",
    updatedAt: Date.now(),
    finalResult: {
      outputMode: "inline",
      status: "failed",
      summary: "Source reading failed.",
      markdown: "## 结论\nSource reading failed.",
      keyResults: [],
      completedSteps: [],
      remainingOrFailedSteps: ["readResearchSourceFacts"],
      errorsOrBlockers: ["Source reading failed."],
      artifacts: [],
      suggestedNextAction: "",
    },
  };
}

async function loadSidepanel() {
  vi.resetModules();
  await import("../src/sidepanel/index");
}

describe("sidepanel result actions", () => {
  const idleState: SessionPublicState = {
    status: "idle",
    currentStep: 0,
    plan: [],
    items: [],
    logs: [],
    timeline: [],
    updatedAt: Date.now(),
  };

  const rolledBackState: SessionPublicState = {
    ...createInlineState(),
    finalResult: {
      ...createInlineState().finalResult!,
      summary: "黄金近期波动上行。",
      markdown: "## 结论\n黄金近期波动上行。",
    },
    conversationTurns: createConversationTurns().slice(0, 1),
  };

  let requestStatePayload: SessionPublicState | undefined;
  const clipboardWriteText = vi.fn<(...args: [string]) => Promise<void>>();
  const sendMessage = vi.fn(async (message: { type: string; conversationId?: string; turnId?: number }) => {
    if (message.type === "REQUEST_SESSION_STATE") {
      return requestStatePayload ? { ok: true, payload: requestStatePayload } : { ok: false };
    }

    if (message.type === "CREATE_CONVERSATION") {
      return {
        ok: true,
        payload: {
          ...idleState,
          conversationId: "conversation-new",
          conversationTitle: "新会话",
          conversationTurns: [],
          availableConversations: [
            {
              conversationId: "conversation-new",
              title: "新会话",
              turnCount: 0,
              updatedAt: Date.now(),
            },
            ...conversationSummaries,
          ],
        },
      };
    }

    if (message.type === "SELECT_CONVERSATION") {
      return {
        ok: true,
        payload: createInlineState(),
      };
    }

    if (message.type === "ROLLBACK_CONVERSATION_TURN") {
      return {
        ok: true,
        payload: rolledBackState,
      };
    }

    if (message.type === "DELETE_CONVERSATION") {
      return {
        ok: true,
        payload: idleState,
      };
    }

    return { ok: true };
  });

  const addListener = vi.fn((listener: (message: RuntimeMessage) => void) => {
    onRuntimeMessage = listener;
  });

  const createObjectURL = vi.fn(() => "blob:artifact");
  const revokeObjectURL = vi.fn();
  let anchorClickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    onRuntimeMessage = undefined;
    requestStatePayload = undefined;
    clipboardWriteText.mockReset();
    sendMessage.mockClear();
    addListener.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onMessage: {
          addListener,
        },
      },
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });

    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    anchorClickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("hides runtime and results before the first session starts", async () => {
    await loadSidepanel();

    expect(document.getElementById("start-button")).not.toBeNull();
    expect(document.getElementById("stop-button")).toBeNull();
    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.querySelectorAll("details.section-details")).toHaveLength(1);
    expect(document.body.textContent).toContain("当前会话");
    expect(document.body.textContent).toContain("新建会话");

    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    expect(goalInput?.value).toBe("");
    expect(goalInput?.getAttribute("placeholder")).toBe("你想知道什么");
  });

  it("shows timeline instead of runtime status while running", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createRunningState(),
    });

    expect(document.getElementById("start-button")).toBeNull();
    expect(document.getElementById("stop-button")).not.toBeNull();
    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.body.textContent).toContain("Collecting source candidates.");
    expect(document.body.textContent).toContain("Gold trend timeline");
    expect(document.querySelectorAll("section.section")).toHaveLength(2);
    expect((document.getElementById("create-conversation-button") as HTMLButtonElement | null)?.disabled).toBe(true);
    expect(document.querySelector(".status-grid")).toBeNull();
  });

  it("keeps inline success in the conversation stream without a duplicate results panel", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createInlineState(),
    });

    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.getElementById("stop-button")).toBeNull();
    expect(document.getElementById("start-button")).not.toBeNull();
    expect(document.querySelectorAll("details.section-details")).toHaveLength(1);
    expect(document.querySelectorAll("section.section")).toHaveLength(1);
    expect(document.querySelector("[data-copy-turn-id='2']")).not.toBeNull();
  });

  it("shows runtime status when the session fails", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createFailedState(),
    });

    expect(document.querySelectorAll("section.section")).toHaveLength(2);
    expect(document.querySelector(".status-grid")).not.toBeNull();
    expect(document.body.textContent).toContain("Source reading failed.");
  });

  it("copies a historical turn from the shared conversation stream", async () => {
    requestStatePayload = createInlineState();
    await loadSidepanel();

    const turnCopyButton = document.querySelector("[data-copy-turn-id='1']");
    expect(turnCopyButton).not.toBeNull();

    (turnCopyButton as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(createConversationTurns()[0]!.answerMarkdown);
    });
  });

  it("opens the conversation drawer and rolls back to a selected turn", async () => {
    requestStatePayload = createInlineState();
    await loadSidepanel();

    expect(document.querySelector("[data-rollback-turn-id='1']")).not.toBeNull();
    expect((document.getElementById("goal-input") as HTMLTextAreaElement | null)?.value).toBe("");

    const toggleButton = document.getElementById("toggle-conversations-button");
    expect(toggleButton).not.toBeNull();

    (toggleButton as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("黄金是否与近期战争有关？");
      expect(document.querySelector("[data-rollback-turn-id='1']")).not.toBeNull();
    });

    const rollbackButton = document.querySelector("[data-rollback-turn-id='1']");
    expect(rollbackButton).not.toBeNull();

    (rollbackButton as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "ROLLBACK_CONVERSATION_TURN",
        conversationId: "conversation-1",
        turnId: 1,
      });
      expect(document.body.textContent).not.toContain("战争是避险情绪因素之一。");
      expect(document.body.textContent).toContain("黄金近期波动上行。");
    });
  });

  it("renders document artifact actions and triggers download for artifact output", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createArtifactState(),
    });

    expect(document.getElementById("copy-result-button")).toBeNull();

    const sections = document.querySelectorAll("section.section");
    expect(sections).toHaveLength(2);

    const downloadButton = document.querySelector("[data-download-artifact-index='0']");
    expect(downloadButton).not.toBeNull();

    (downloadButton as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:artifact");
    });
  });
});
