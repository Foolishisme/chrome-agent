import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPublicState } from "../src/shared/types";

type RuntimeMessage = {
  type: string;
  payload?: SessionPublicState;
};

let onRuntimeMessage: ((message: RuntimeMessage) => void) | undefined;

function createState(): SessionPublicState {
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
    timeline: [],
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

  it("renders a default copy action and copies the final markdown", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createInlineState(),
    });

    const button = document.getElementById("copy-result-button");
    expect(button).not.toBeNull();

    (button as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith("## Summary\nCollected a usable result.");
    });
  });

  it("renders document artifact actions and triggers download from a collapsible card", async () => {
    await loadSidepanel();
    onRuntimeMessage?.({
      type: "SESSION_UPDATE",
      payload: createState(),
    });

    expect(document.getElementById("copy-result-button")).toBeNull();
    expect(document.body.textContent).not.toContain("文件名");
    expect(document.body.textContent).not.toContain("文档摘要");

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
