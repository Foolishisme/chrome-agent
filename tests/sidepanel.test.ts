import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary, ConversationTurn, LlmProfile, SessionPublicState } from "../src/shared/types";

type RuntimeMessage = {
  type: string;
  payload?: SessionPublicState;
};

let onRuntimeMessage: ((message: RuntimeMessage) => void) | undefined;
const LLM_PROFILE_STORAGE_KEY = "browser-agent.llm-profile";
let storedLlmProfile: LlmProfile | undefined;

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
      savedAt: Date.now() - 5_000,
    },
    {
      turnId: 2,
      sessionId: "session-2",
      goal: "黄金是否与近期战争有关？",
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
    goal: "黄金是否与近期战争有关？",
    status: "running",
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

function createStoppedState(): SessionPublicState {
  return {
    conversationId: "conversation-1",
    conversationTitle: "杩戞湡榛勯噾",
    conversationTurns: createConversationTurns(),
    availableConversations: conversationSummaries,
    sessionId: "session-stopped",
    goal: "Will source reading fail?",
    status: "done",
    error: "The session was stopped before completion.",
    updatedAt: Date.now(),
    finalResult: {
      outputMode: "inline",
      status: "partial",
      summary: "The session was stopped before completion.",
      markdown: "## 结论\nThe session was stopped before completion.",
      keyResults: [],
      completedSteps: [],
      remainingOrFailedSteps: ["filterResearchCandidates"],
      errorsOrBlockers: ["The session was stopped before completion."],
      artifacts: [],
      suggestedNextAction: "",
    },
  };
}

function createRunningStateWithTransientError(): SessionPublicState {
  return {
    ...createRunningState(),
    error: "Retrying after a transient read failure.",
  };
}

async function loadSidepanel() {
  vi.resetModules();
  await import("../src/sidepanel/index");
}

describe("sidepanel result actions", () => {
  const idleState: SessionPublicState = {
    status: "idle",
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
  const defaultSendMessageImplementation = async (message: {
    type: string;
    conversationId?: string;
    turnId?: number;
    goal?: string;
    searchPreference?: string;
  }) => {
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
  };
  const sendMessage = vi.fn(defaultSendMessageImplementation);
  const storageGet = vi.fn(async () => ({
    [LLM_PROFILE_STORAGE_KEY]: storedLlmProfile,
  }));
  const storageSet = vi.fn(async (values: Record<string, LlmProfile>) => {
    storedLlmProfile = values[LLM_PROFILE_STORAGE_KEY];
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
    storedLlmProfile = undefined;
    clipboardWriteText.mockReset();
    sendMessage.mockReset();
    sendMessage.mockImplementation(defaultSendMessageImplementation);
    storageGet.mockClear();
    storageSet.mockClear();
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
      storage: {
        local: {
          get: storageGet,
          set: storageSet,
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
    expect(document.getElementById("search-preference-toggle")?.getAttribute("aria-pressed")).toBe("false");
    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.querySelectorAll("details.section-details")).toHaveLength(1);
    expect(document.body.textContent).toContain("当前会话");
    expect(document.body.textContent).toContain("对话");

    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    expect(goalInput?.value).toBe("");
    expect(goalInput?.getAttribute("placeholder")).toBe("你想知道什么");
  });

  it("sends prefer_search when the magnifier toggle is enabled before start", async () => {
    await loadSidepanel();

    const toggleButton = document.getElementById("search-preference-toggle") as HTMLButtonElement | null;
    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    const startButton = document.getElementById("start-button") as HTMLButtonElement | null;

    expect(toggleButton).not.toBeNull();
    expect(goalInput).not.toBeNull();
    expect(startButton).not.toBeNull();

    toggleButton!.click();
    goalInput!.value = "解释一下事件循环";
    goalInput!.dispatchEvent(new Event("input"));
    startButton!.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "START_SESSION",
        goal: "解释一下事件循环",
        searchPreference: "prefer_search",
        llmProfile: "external",
      });
    });
  });

  it("persists and reuses the selected local LLM profile", async () => {
    await loadSidepanel();

    const localButton = document.querySelector("[data-llm-profile='local']") as HTMLButtonElement | null;
    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    const startButton = document.getElementById("start-button") as HTMLButtonElement | null;

    expect(localButton).not.toBeNull();
    expect(goalInput).not.toBeNull();
    expect(startButton).not.toBeNull();

    localButton!.click();

    await vi.waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith({
        [LLM_PROFILE_STORAGE_KEY]: "local",
      });
    });

    goalInput!.value = "test profile selection";
    goalInput!.dispatchEvent(new Event("input"));
    startButton!.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "START_SESSION",
          goal: "test profile selection",
          llmProfile: "local",
        }),
      );
    });
  });

  it("echoes the submitted goal immediately before the runtime session state returns", async () => {
    let resolveStartSession:
      | ((value: { ok: boolean; payload?: SessionPublicState; error?: string }) => void)
      | undefined;

    sendMessage.mockImplementation(async (message: { type: string; goal?: string; searchPreference?: string }) => {
      if (message.type === "REQUEST_SESSION_STATE") {
        return { ok: false };
      }

      if (message.type === "START_SESSION") {
        return await new Promise<{ ok: boolean; payload?: SessionPublicState; error?: string }>((resolve) => {
          resolveStartSession = resolve;
        });
      }

      return { ok: true };
    });

    await loadSidepanel();

    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    const startButton = document.getElementById("start-button") as HTMLButtonElement | null;

    expect(goalInput).not.toBeNull();
    expect(startButton).not.toBeNull();

    goalInput!.value = "为什么南京叫南京";
    goalInput!.dispatchEvent(new Event("input"));
    startButton!.click();

    expect(document.body.textContent).toContain("为什么南京叫南京");
    expect(document.body.textContent).toMatch(/正在理解问题并启动会话|Understanding the question and starting the session/);
    expect(document.getElementById("start-button")).toBeNull();
    expect(document.getElementById("stop-button")).not.toBeNull();

    resolveStartSession?.({
      ok: true,
      payload: createRunningState(),
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toMatch(/正在处理请求|Working on it/);
    });
  });

  it("shows a minimal running placeholder without runtime details", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createRunningState(),
    });

    expect(document.getElementById("start-button")).toBeNull();
    expect(document.getElementById("stop-button")).not.toBeNull();
    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.body.textContent).toMatch(/正在处理请求|Working on it/);
    expect(document.body.textContent).not.toContain("Collecting source candidates.");
    expect(document.body.textContent).not.toContain("Gold trend timeline");
    expect(document.querySelectorAll("section.section")).toHaveLength(1);
    expect(document.body.textContent).toContain("对话");
    expect(document.querySelector(".status-grid")).toBeNull();
    expect(document.querySelector(".timeline-details")).toBeNull();
  });

  it("does not submit stop when Enter is pressed during a running session", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createRunningState(),
    });

    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    expect(goalInput).not.toBeNull();

    goalInput!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(sendMessage).not.toHaveBeenCalledWith({
      type: "STOP_SESSION",
    });
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
    expect(document.querySelector(".timeline-details")).toBeNull();
  });

  it("allows cancelling while the optimistic startup state is pending", async () => {
    let resolveStartSession:
      | ((value: { ok: boolean; payload?: SessionPublicState; error?: string }) => void)
      | undefined;

    sendMessage.mockImplementation(async (message: { type: string; goal?: string; searchPreference?: string }) => {
      if (message.type === "REQUEST_SESSION_STATE") {
        return { ok: false };
      }

      if (message.type === "START_SESSION") {
        return await new Promise<{ ok: boolean; payload?: SessionPublicState; error?: string }>((resolve) => {
          resolveStartSession = resolve;
        });
      }

      return { ok: true };
    });

    await loadSidepanel();

    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    const startButton = document.getElementById("start-button") as HTMLButtonElement | null;

    goalInput!.value = "为什么南京叫南京";
    goalInput!.dispatchEvent(new Event("input"));
    startButton!.click();

    const stopButton = document.getElementById("stop-button") as HTMLButtonElement | null;
    expect(stopButton).not.toBeNull();

    stopButton!.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "STOP_SESSION",
      });
      expect(document.getElementById("start-button")).not.toBeNull();
    });

    resolveStartSession?.({
      ok: false,
      error: "The session was stopped.",
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).not.toContain("启动会话失败");
    });
  });

  it("shows a concise failure result without runtime details", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createFailedState(),
    });

    expect(document.querySelectorAll("section.section")).toHaveLength(1);
    expect(document.querySelector(".status-grid")).toBeNull();
    expect(document.body.textContent).toContain("Source reading failed.");
  });

  it("does not show runtime status when the user stops the session", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createStoppedState(),
    });

    expect(document.querySelectorAll("section.section")).toHaveLength(1);
    expect(document.querySelector(".status-grid")).toBeNull();
    expect(document.body.textContent).toContain("The session was stopped before completion.");
  });

  it("does not show runtime status for transient tool errors while the session is still running", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createRunningStateWithTransientError(),
    });

    expect(document.querySelectorAll("section.section")).toHaveLength(1);
    expect(document.querySelector(".status-grid")).toBeNull();
    expect(document.body.textContent).not.toContain("Retrying after a transient read failure.");
    expect(document.body.textContent).toMatch(/正在处理请求|Working on it/);
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

  it("delegates repeated click actions without duplicating handlers after multiple rerenders", async () => {
    requestStatePayload = createInlineState();
    await loadSidepanel();

    onRuntimeMessage?.({ type: "SESSION_UPDATE", payload: createInlineState() });
    onRuntimeMessage?.({ type: "SESSION_UPDATE", payload: createInlineState() });

    const turnCopyButton = document.querySelector("[data-copy-turn-id='1']");
    expect(turnCopyButton).not.toBeNull();

    (turnCopyButton as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });
  });
});
