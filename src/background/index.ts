import { DEFAULT_GOAL } from "../shared/constants";
import type {
  ClearManualExtractionHistoryMessage,
  ExtractCurrentPageMessage,
  ManualExtractionResponse,
  RequestSessionStateMessage,
  RequestManualExtractionHistoryMessage,
  StartSessionMessage,
  StartSessionResponse,
  StopSessionMessage,
} from "../shared/protocol";
import { clearManualExtractionHistory, extractCurrentPageForReview, getManualExtractionHistory } from "./manual-extraction";
import { BrowserAgentRuntime } from "./runtime";

const runtime = new BrowserAgentRuntime();

function isScriptableUrl(url?: string | null) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function getActiveScriptableTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }

  if (!isScriptableUrl(tab.url)) {
    throw new Error("The active tab is not a scriptable web page.");
  }

  return tab;
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener(
  (
    message:
      | StartSessionMessage
      | StopSessionMessage
      | RequestSessionStateMessage
      | ExtractCurrentPageMessage
      | RequestManualExtractionHistoryMessage
      | ClearManualExtractionHistoryMessage,
    _sender,
    sendResponse,
  ) => {
    if (message.type === "START_SESSION") {
      void runtime
        .start(message.goal || DEFAULT_GOAL)
        .then((response) => sendResponse(response satisfies StartSessionResponse))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "启动会话失败",
            payload: runtime.getState(),
          }),
        );
      return true;
    }

    if (message.type === "STOP_SESSION") {
      runtime.stop();
      sendResponse({
        ok: true,
        payload: runtime.getState(),
      });
      return false;
    }

    if (message.type === "REQUEST_SESSION_STATE") {
      sendResponse({
        ok: true,
        payload: runtime.getState(),
      });
      return false;
    }

    if (message.type === "REQUEST_MANUAL_EXTRACTION_HISTORY") {
      void getManualExtractionHistory()
        .then((history) =>
          sendResponse({
            ok: true,
            history,
          } satisfies ManualExtractionResponse),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to load local extraction history.",
          } satisfies ManualExtractionResponse),
        );
      return true;
    }

    if (message.type === "CLEAR_MANUAL_EXTRACTION_HISTORY") {
      void clearManualExtractionHistory()
        .then(() =>
          sendResponse({
            ok: true,
            history: [],
          } satisfies ManualExtractionResponse),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to clear local extraction history.",
          } satisfies ManualExtractionResponse),
        );
      return true;
    }

    if (message.type === "EXTRACT_CURRENT_PAGE") {
      void (async () => {
        if (runtime.getState().status === "running") {
          throw new Error("Stop the current session before manual page extraction.");
        }

        const tab = await getActiveScriptableTab();
        const result = await extractCurrentPageForReview(tab.id!);
        sendResponse({
          ok: true,
          record: result.record,
          history: result.history,
        } satisfies ManualExtractionResponse);
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to extract the current page.",
        } satisfies ManualExtractionResponse),
      );
      return true;
    }

    return false;
  },
);
