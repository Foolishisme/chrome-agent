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

function createConversationTurns(): ConversationTurn[] {
  return [
    {
      turnId: 1,
      sessionId: "session-1",
      goal: "近期黄金",
      answerSummary: "黄金近期波动上行。",
      answerMarkdown: "## 结论\n黄金近期波动上行。",
      savedAt: Date.now() - 5000,
    },
    {
      turnId: 2,
      sessionId: "session-2",
      goal: "黄金是否与近期战争有关",
      answerSummary: "战争是避险情绪因素之一。",
      answerMarkdown: "## 结论\n战争是避险情绪因素之一。",
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
    goal: "黄金是否与近期战争有关",
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
    goal: "黄金是否与近期战争有关",
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
    goal: "黄金是否与近期战争有关",
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
    expect(document.getElementById("retry-button")).toBeNull();
    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.querySelectorAll("details.section-details")).toHaveLength(1);
  });

  it("shows live execution trace before a final result exists", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createRunningState(),
    });

    expect(document.getElementById("start-button")).toBeNull();
    expect(document.getElementById("stop-button")).not.toBeNull();
    expect(document.getElementById("retry-button")).toBeNull();
    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.body.textContent).toContain("Collecting source candidates.");

    const openDetails = Array.from(document.querySelectorAll("details.debug-detail[open]"));
    expect(openDetails.length).toBeGreaterThan(0);
  });

  it("renders a default copy action and copies the final markdown", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createInlineState(),
    });

    const button = document.getElementById("copy-result-button");
    expect(button).not.toBeNull();
    expect(document.getElementById("retry-button")).toBeNull();
    expect(document.getElementById("stop-button")).toBeNull();
    expect(document.getElementById("start-button")).not.toBeNull();

    const runtimeSection = document.querySelectorAll("details.section-details")[1] as HTMLDetailsElement | undefined;
    expect(runtimeSection?.open).toBe(false);

    (button as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith("## Summary\nCollected a usable result.");
    });
  });

  it("opens the conversation drawer and rolls back to a selected turn", async () => {
    requestStatePayload = createInlineState();
    await loadSidepanel();

    const toggleButton = document.getElementById("toggle-conversations-button");
    expect(toggleButton).not.toBeNull();

    (toggleButton as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("黄金是否与近期战争有关");
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

  it("renders document artifact actions and triggers download from a collapsible card", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createArtifactState(),
    });

    expect(document.getElementById("retry-button")).toBeNull();
    expect(document.getElementById("copy-result-button")).toBeNull();

    const details = document.querySelector("details.source-card");
    expect(details).not.toBeNull();

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
