import type { ResultArtifact, SearchPreference, SessionPublicState, StepRecord } from "../shared/types";
import { archiveUiText, messages, optimisticAssistantProgressText } from "./ui-text";

export type PendingSessionSubmission = {
  requestId: number;
  goal: string;
  searchPreference: SearchPreference;
  startedAt: number;
};

export type UiNoticeTone = "info" | "error";

const browserAgentWindow = window as Window & typeof globalThis & { __browserAgentElapsedTicker?: number };

function createBaseState(): SessionPublicState {
  return {
    status: "idle",
    currentStep: 0,
    plan: [],
    items: [],
    logs: [],
    timeline: [],
    updatedAt: Date.now(),
  };
}

const state = {
  currentState: createBaseState(),
  draftGoal: "",
  draftSearchPreference: "auto" as SearchPreference,
  uiNotice: "",
  uiNoticeTone: "info" as UiNoticeTone,
  uiNoticeTimer: undefined as number | undefined,
  showConversationDrawer: false,
  pendingSessionSubmission: undefined as PendingSessionSubmission | undefined,
  nextPendingSessionRequestId: 0,
  cancelledPendingSessionRequestIds: new Set<number>(),
};

export function getBrowserAgentWindow() {
  return browserAgentWindow;
}

export function getCurrentState() {
  return state.currentState;
}

export function getDraftGoal() {
  return state.draftGoal;
}

export function setDraftGoal(value: string) {
  state.draftGoal = value;
}

export function getDraftSearchPreference() {
  return state.draftSearchPreference;
}

export function toggleDraftSearchPreference() {
  state.draftSearchPreference = state.draftSearchPreference === "prefer_search" ? "auto" : "prefer_search";
}

export function getUiNotice() {
  return {
    message: state.uiNotice,
    tone: state.uiNoticeTone,
  };
}

export function setUiNotice(message: string, tone: UiNoticeTone = "info", onRender: () => void) {
  state.uiNotice = message;
  state.uiNoticeTone = tone;

  if (state.uiNoticeTimer !== undefined) {
    window.clearTimeout(state.uiNoticeTimer);
  }

  state.uiNoticeTimer = window.setTimeout(() => {
    state.uiNotice = "";
    state.uiNoticeTimer = undefined;
    onRender();
  }, 2500);

  onRender();
}

export function isConversationDrawerOpen() {
  return state.showConversationDrawer;
}

export function toggleConversationDrawer() {
  state.showConversationDrawer = !state.showConversationDrawer;
  return state.showConversationDrawer;
}

export function openConversationDrawer() {
  state.showConversationDrawer = true;
}

export function closeConversationDrawer() {
  state.showConversationDrawer = false;
}

export function getPendingSessionSubmission() {
  return state.pendingSessionSubmission;
}

export function beginPendingSession(goal: string, searchPreference: SearchPreference) {
  const requestId = ++state.nextPendingSessionRequestId;
  state.pendingSessionSubmission = {
    requestId,
    goal,
    searchPreference,
    startedAt: Date.now(),
  };
  state.draftGoal = "";
  return requestId;
}

export function consumeCancelledRequest(requestId: number) {
  return state.cancelledPendingSessionRequestIds.delete(requestId);
}

export function cancelPendingSession() {
  if (!state.pendingSessionSubmission) {
    return;
  }

  state.cancelledPendingSessionRequestIds.add(state.pendingSessionSubmission.requestId);
  state.pendingSessionSubmission = undefined;
}

export function clearPendingSession() {
  state.pendingSessionSubmission = undefined;
}

export function hasSessionActivity() {
  return (
    Boolean(state.pendingSessionSubmission) ||
    state.currentState.status !== "idle" ||
    state.currentState.timeline.length > 0 ||
    state.currentState.logs.length > 0 ||
    Boolean(state.currentState.finalResult) ||
    Boolean(state.currentState.error)
  );
}

export function getCurrentProgressText() {
  if (state.pendingSessionSubmission && state.currentState.status === "idle") {
    return optimisticAssistantProgressText;
  }

  return state.currentState.error ?? state.currentState.stepSummary ?? state.currentState.finalResult?.summary ?? messages.assistantWaiting;
}

export function getActiveSearchPreference() {
  return state.currentState.status === "running"
    ? state.currentState.searchPreference ?? state.draftSearchPreference
    : state.draftSearchPreference;
}

function getTimelineDurationMs(records: StepRecord[]) {
  if (records.length === 0) {
    return undefined;
  }

  const timestamps = records
    .map((record) => record.timestamp)
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => left - right);

  if (timestamps.length === 0) {
    return undefined;
  }

  return Math.max(1000, timestamps.at(-1)! - timestamps[0]!);
}

export function getDisplayedElapsedMs() {
  if (state.currentState.elapsedMs !== undefined) {
    if (state.currentState.status !== "running") {
      return state.currentState.elapsedMs;
    }

    return state.currentState.elapsedMs + Math.max(0, Date.now() - state.currentState.updatedAt);
  }

  return getTimelineDurationMs(state.currentState.timeline);
}

export function getFinalResultDisplayMarkdown() {
  return (
    state.currentState.finalResult?.markdown?.trim() ||
    state.currentState.finalResult?.artifacts.find((artifact) => artifact.kind === "markdown")?.content?.trim() ||
    state.currentState.finalResult?.summary?.trim() ||
    ""
  );
}

export function getDefaultResultCopyText() {
  return getFinalResultDisplayMarkdown();
}

export function getDocumentArtifacts(): ResultArtifact[] {
  return (state.currentState.finalResult?.artifacts ?? []).filter((artifact) => artifact.kind === "markdown");
}

export function applyState(next: SessionPublicState | undefined, onRender: () => void) {
  if (!next) {
    return;
  }

  if (
    state.pendingSessionSubmission &&
    (next.status !== "idle" || Boolean(next.goal) || Boolean(next.sessionId) || Boolean(next.finalResult) || Boolean(next.error))
  ) {
    state.pendingSessionSubmission = undefined;
  }

  const hasConversationId = Object.prototype.hasOwnProperty.call(next, "conversationId");
  const hasConversationTitle = Object.prototype.hasOwnProperty.call(next, "conversationTitle");
  const hasConversationTurns = Object.prototype.hasOwnProperty.call(next, "conversationTurns");
  const hasAvailableConversations = Object.prototype.hasOwnProperty.call(next, "availableConversations");

  state.currentState = {
    ...createBaseState(),
    ...next,
    availableConversations: hasAvailableConversations ? next.availableConversations : state.currentState.availableConversations,
    conversationTurns: hasConversationTurns ? next.conversationTurns : state.currentState.conversationTurns,
    conversationId: hasConversationId ? next.conversationId : state.currentState.conversationId,
    conversationTitle: hasConversationTitle ? next.conversationTitle : state.currentState.conversationTitle,
  };
  onRender();
}

export function getRenderState() {
  return {
    currentState: state.currentState,
    draftGoal: state.draftGoal,
    uiNotice: state.uiNotice,
    uiNoticeTone: state.uiNoticeTone,
    showConversationDrawer: state.showConversationDrawer,
    pendingSessionSubmission: state.pendingSessionSubmission,
    activeSearchPreference: getActiveSearchPreference(),
    currentProgressText: getCurrentProgressText(),
    displayedElapsedMs: getDisplayedElapsedMs(),
    finalResultDisplayMarkdown: getFinalResultDisplayMarkdown(),
    documentArtifacts: getDocumentArtifacts(),
    archiveUiText,
    messages,
  };
}
