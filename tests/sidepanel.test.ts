import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPublicState } from "../src/shared/types";

type RuntimeMessage = {
  type: string;
  payload?: SessionPublicState;
};

let onRuntimeMessage: ((message: RuntimeMessage) => void) | undefined;

function createRunningState(): SessionPublicState {
  return {
    sessionId: "session-running",
    goal: "Test research goal",
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
  const clipboardWriteText = vi.fn<(...args: [string]) => Promise<void>>();
  const sendMessage = vi.fn(async (message: { type: string }) => {
    if (message.type === "REQUEST_SESSION_STATE") {
      return { ok: false };
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
