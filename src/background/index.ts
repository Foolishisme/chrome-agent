import { DEFAULT_GOAL } from "../shared/constants";
import type {
  ClearManualExtractionHistoryMessage,
  CreateConversationMessage,
  DeleteConversationMessage,
  DeleteSessionArchiveMessage,
  ExtractCurrentPageMessage,
  ManualExtractionResponse,
  RollbackConversationTurnMessage,
  RequestSessionStateMessage,
  RequestManualExtractionHistoryMessage,
  SelectConversationMessage,
  SessionStateResponse,
  StartSessionMessage,
  StartSessionResponse,
  StopSessionMessage,
} from "../shared/protocol";
import { clearManualExtractionHistory, extractCurrentPageForReview, getManualExtractionHistory } from "./manual-extraction";
import { BrowserAgentRuntime } from "./runtime";
import {
  createConversation,
  createConversationState,
  deleteConversationState,
  getPreferredConversation,
  loadConversationBackfillState,
  loadConversationState,
  rollbackConversationState,
  toConversationTurns,
} from "./session-archive";

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

function hasMeaningfulSessionState() {
  const state = runtime.getState();
  return (
    state.status !== "idle" ||
    state.currentStep > 0 ||
    state.timeline.length > 0 ||
    state.logs.length > 0 ||
    !!state.finalResult ||
    !!state.error ||
    !!state.sessionId ||
    !!state.goal
  );
}

async function buildSessionStateResponse() {
  const liveState = runtime.getState();
  const archivedState = await loadConversationBackfillState(liveState);

  if (!hasMeaningfulSessionState()) {
    return archivedState;
  }

  return {
    ...archivedState,
    ...liveState,
    conversationId: liveState.conversationId ?? archivedState.conversationId,
    conversationTitle: liveState.conversationTitle ?? archivedState.conversationTitle,
    conversationTurns: liveState.conversationTurns ?? archivedState.conversationTurns,
    availableConversations: archivedState.availableConversations,
  };
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
      | CreateConversationMessage
      | SelectConversationMessage
      | DeleteConversationMessage
      | RollbackConversationTurnMessage
      | DeleteSessionArchiveMessage
      | ExtractCurrentPageMessage
      | RequestManualExtractionHistoryMessage
      | ClearManualExtractionHistoryMessage,
    _sender,
    sendResponse,
  ) => {
    if (message.type === "START_SESSION") {
      void (async () => {
        const preferredConversation = (await getPreferredConversation()) ?? (await createConversation(message.goal || DEFAULT_GOAL));
        const response = await runtime.start(message.goal || DEFAULT_GOAL, {
          conversationId: preferredConversation.conversationId,
          conversationTitle: preferredConversation.title,
          conversationTurns: toConversationTurns(preferredConversation),
          currentTurnId: preferredConversation.nextTurnId,
          searchPreference: message.searchPreference ?? "auto",
        });
        const payload = await buildSessionStateResponse();
        sendResponse({
          ...response,
          payload,
        } satisfies StartSessionResponse);
      })()
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
      void buildSessionStateResponse()
        .then((payload) =>
          sendResponse({
            ok: true,
            payload,
          } satisfies SessionStateResponse),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to load the current session state.",
            payload: runtime.getState(),
          } satisfies SessionStateResponse),
        );
      return true;
    }

    if (message.type === "CREATE_CONVERSATION") {
      void (async () => {
        if (runtime.getState().status === "running") {
          throw new Error("Stop the current session before creating a new conversation.");
        }

        runtime.clearCompletedState();
        const payload = await createConversationState(runtime.getState());
        sendResponse({
          ok: true,
          payload,
        } satisfies SessionStateResponse);
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to create a new conversation.",
          payload: runtime.getState(),
        } satisfies SessionStateResponse),
      );
      return true;
    }

    if (message.type === "SELECT_CONVERSATION") {
      void (async () => {
        if (runtime.getState().status === "running") {
          throw new Error("Stop the current session before switching conversations.");
        }

        runtime.clearCompletedState();
        const payload = await loadConversationState(message.conversationId, runtime.getState());
        sendResponse({
          ok: true,
          payload,
        } satisfies SessionStateResponse);
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to load the selected conversation.",
          payload: runtime.getState(),
        } satisfies SessionStateResponse),
      );
      return true;
    }

    if (message.type === "DELETE_CONVERSATION") {
      void (async () => {
        if (runtime.getState().status === "running") {
          throw new Error("Stop the current session before deleting a conversation.");
        }

        runtime.clearCompletedState();
        const payload = await deleteConversationState(message.conversationId, runtime.getState());
        sendResponse({
          ok: true,
          payload,
        } satisfies SessionStateResponse);
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to delete the conversation.",
          payload: runtime.getState(),
        } satisfies SessionStateResponse),
      );
      return true;
    }

    if (message.type === "ROLLBACK_CONVERSATION_TURN") {
      void (async () => {
        if (runtime.getState().status === "running") {
          throw new Error("Stop the current session before rolling back a conversation.");
        }

        runtime.clearCompletedState();
        const payload = await rollbackConversationState(message.conversationId, message.turnId, runtime.getState());
        sendResponse({
          ok: true,
          payload,
        } satisfies SessionStateResponse);
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to roll back the conversation.",
          payload: runtime.getState(),
        } satisfies SessionStateResponse),
      );
      return true;
    }

    if (message.type === "DELETE_SESSION_ARCHIVE") {
      void (async () => {
        if (runtime.getState().status === "running") {
          throw new Error("Stop the current session before deleting it.");
        }
        const conversationId = runtime.getState().conversationId;
        if (!conversationId) {
          throw new Error("No active conversation is selected.");
        }

        runtime.clearCompletedState(message.sessionId);
        const payload = await deleteConversationState(conversationId, runtime.getState());
        sendResponse({
          ok: true,
          payload,
        } satisfies SessionStateResponse);
      })().catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to delete the current session.",
          payload: runtime.getState(),
        } satisfies SessionStateResponse),
      );
      return true;
    }

    if (message.type === "REQUEST_MANUAL_EXTRACTION_HISTORY") {
      // Deprecated internal QA route. Kept temporarily for backend-only manual review flows.
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
      // Deprecated internal QA route. Kept temporarily for backend-only manual review flows.
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
      // Deprecated internal QA route. Kept temporarily for backend-only manual review flows.
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
