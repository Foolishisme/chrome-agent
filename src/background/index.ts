import { DEFAULT_GOAL } from "../shared/constants";
import type {
  RequestSessionStateMessage,
  StartSessionMessage,
  StartSessionResponse,
  StopSessionMessage,
} from "../shared/protocol";
import { BrowserAgentRuntime } from "./runtime";

const runtime = new BrowserAgentRuntime();

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener((message: StartSessionMessage | StopSessionMessage | RequestSessionStateMessage, _sender, sendResponse) => {
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

  return false;
});
