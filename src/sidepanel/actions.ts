import type { SessionStateResponse, StartSessionResponse } from "../shared/protocol";
import type { SessionPublicState } from "../shared/types";
import {
  applyState,
  beginPendingSession,
  cancelPendingSession,
  clearPendingSession,
  consumeCancelledRequest,
  getCurrentState,
  getDefaultResultCopyText,
  getDocumentArtifacts,
  getDraftSearchPreference,
  getPendingSessionSubmission,
  openConversationDrawer,
  setDraftGoal,
  setUiNotice,
  toggleConversationDrawer,
} from "./state";
import { archiveUiText, emptyGoalNotice, messages } from "./ui-text";

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "true");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
}

function downloadArtifact(index: number) {
  const artifact = getDocumentArtifacts()[index];
  if (!artifact) {
    throw new Error(messages.documentEmpty);
  }

  const blob = new Blob([artifact.content], {
    type: artifact.mimeType,
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = artifact.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export async function requestSessionState(render: () => void) {
  const response = (await chrome.runtime.sendMessage({
    type: "REQUEST_SESSION_STATE",
  })) as SessionStateResponse;

  if (!response.ok) {
    throw new Error(response.error || "Failed to load the current session state.");
  }

  if (response.payload) {
    applyState(response.payload, render);
  }

  return response;
}

export async function startSession(goal: string, render: () => void) {
  if (!goal.trim()) {
    setUiNotice(emptyGoalNotice, "error", render);
    return;
  }

  const requestId = beginPendingSession(goal.trim(), getDraftSearchPreference());
  render();

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "START_SESSION",
      goal: goal.trim(),
      searchPreference: getDraftSearchPreference(),
    })) as StartSessionResponse;

    if (!response.ok) {
      throw new Error(response.error || "启动会话失败");
    }

    if (consumeCancelledRequest(requestId)) {
      return;
    }

    if (response.payload) {
      applyState(response.payload, render);
    }
  } catch (error) {
    if (consumeCancelledRequest(requestId)) {
      return;
    }

    clearPendingSession();
    setDraftGoal(goal.trim());
    render();
    setUiNotice(error instanceof Error ? error.message : "启动会话失败", "error", render);
  }
}

export async function stopSession(render: () => void) {
  if (getPendingSessionSubmission()) {
    cancelPendingSession();
    render();
  }

  await chrome.runtime.sendMessage({
    type: "STOP_SESSION",
  });
}

export async function toggleConversationPanel(render: () => void) {
  const open = toggleConversationDrawer();
  if (open) {
    try {
      await requestSessionState(render);
    } catch {
      setUiNotice(archiveUiText.selectConversationFailed, "error", render);
    }
  } else {
    render();
  }
}

export async function createConversation(render: () => void) {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "CREATE_CONVERSATION",
    })) as SessionStateResponse;

    if (!response.ok) {
      throw new Error(response.error || archiveUiText.createConversationFailed);
    }

    openConversationDrawer();
    if (response.payload) {
      applyState(response.payload, render);
    }
    setDraftGoal("");
    setUiNotice(archiveUiText.createConversationReady, "info", render);
  } catch {
    setUiNotice(archiveUiText.createConversationFailed, "error", render);
  }
}

export async function deleteConversation(render: () => void) {
  const currentState = getCurrentState();
  if (!currentState.conversationId) {
    setUiNotice(archiveUiText.deleteConversationFailed, "error", render);
    return;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "DELETE_CONVERSATION",
      conversationId: currentState.conversationId,
    })) as SessionStateResponse;

    if (!response.ok) {
      throw new Error(response.error || archiveUiText.deleteConversationFailed);
    }

    if (response.payload) {
      applyState(response.payload, render);
    }
    setUiNotice(archiveUiText.deleteConversationReady, "info", render);
  } catch {
    setUiNotice(archiveUiText.deleteConversationFailed, "error", render);
  }
}

export async function selectConversation(conversationId: string, render: () => void) {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "SELECT_CONVERSATION",
      conversationId,
    })) as SessionStateResponse;

    if (!response.ok) {
      throw new Error(response.error || archiveUiText.selectConversationFailed);
    }

    if (response.payload) {
      applyState(response.payload, render);
    }
  } catch {
    setUiNotice(archiveUiText.selectConversationFailed, "error", render);
  }
}

export async function rollbackConversation(turnId: number, render: () => void) {
  const currentState = getCurrentState();
  if (!currentState.conversationId || !Number.isFinite(turnId)) {
    setUiNotice(archiveUiText.rollbackConversationFailed, "error", render);
    return;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "ROLLBACK_CONVERSATION_TURN",
      conversationId: currentState.conversationId,
      turnId,
    })) as SessionStateResponse;

    if (!response.ok) {
      throw new Error(response.error || archiveUiText.rollbackConversationFailed);
    }

    if (response.payload) {
      applyState(response.payload, render);
    }
    setUiNotice(archiveUiText.rollbackConversationReady, "info", render);
  } catch {
    setUiNotice(archiveUiText.rollbackConversationFailed, "error", render);
  }
}

export async function copyTurn(turnId: number, render: () => void) {
  const turn = (getCurrentState().conversationTurns ?? []).find((item) => item.turnId === turnId);
  const text = turn?.answerMarkdown?.trim();
  if (!text) {
    setUiNotice(messages.resultCopyUnavailable, "error", render);
    return;
  }

  try {
    await copyTextToClipboard(text);
    setUiNotice(messages.resultCopyReady, "info", render);
  } catch {
    setUiNotice(messages.resultCopyFailed, "error", render);
  }
}

export async function copyLiveResult(render: () => void) {
  const text = getDefaultResultCopyText();
  if (!text) {
    setUiNotice(messages.resultCopyUnavailable, "error", render);
    return;
  }

  try {
    await copyTextToClipboard(text);
    setUiNotice(messages.resultCopyReady, "info", render);
  } catch {
    setUiNotice(messages.resultCopyFailed, "error", render);
  }
}

export async function copyArtifact(index: number, render: () => void) {
  const artifact = getDocumentArtifacts()[index];
  if (!artifact) {
    setUiNotice(messages.documentEmpty, "error", render);
    return;
  }

  try {
    await copyTextToClipboard(artifact.content);
    setUiNotice(messages.resultCopyReady, "info", render);
  } catch {
    setUiNotice(messages.resultCopyFailed, "error", render);
  }
}

export function downloadArtifactByIndex(index: number, render: () => void) {
  try {
    downloadArtifact(index);
    setUiNotice(messages.downloadReady, "info", render);
  } catch {
    setUiNotice(messages.downloadFailed, "error", render);
  }
}

export function handleRuntimeUpdate(payload: SessionPublicState | undefined, render: () => void) {
  applyState(payload, render);
}
