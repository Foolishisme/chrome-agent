import type { ResultArtifact, SearchPreference, SessionPublicState } from "../shared/agent-domain-model";
import type { LlmProfile } from "../shared/agent-domain-model";
import { conversationUiText, messages, optimisticAssistantProgressText } from "./conversation-ui-text";

export type PendingSessionSubmission = {
  requestId: number;
  goal: string;
  searchPreference: SearchPreference;
  startedAt: number;
};

export type UiNoticeTone = "info" | "error";
const LLM_PROFILE_STORAGE_KEY = "browser-agent.llm-profile";
const DEFAULT_LLM_PROFILE: LlmProfile = "external";

function normalizeLlmProfile(profile: string | undefined): LlmProfile | undefined {
  const normalized = profile?.trim().toLowerCase();
  if (normalized === "local") {
    return "local";
  }

  if (normalized === "external" || normalized === "remote") {
    return "external";
  }

  return undefined;
}

function resolveInitialLlmProfile(): LlmProfile {
  return normalizeLlmProfile(import.meta.env.VITE_LLM_PROFILE || import.meta.env.VITE_LLM_DEFAULT_PROFILE) ?? DEFAULT_LLM_PROFILE;
}

function createBaseState(): SessionPublicState {
  return {
    status: "idle",
    updatedAt: Date.now(),
  };
}

const state = {
  currentState: createBaseState(),
  draftGoal: "",
  draftSearchPreference: "auto" as SearchPreference,
  draftLlmProfile: resolveInitialLlmProfile() as LlmProfile,
  uiNotice: "",
  uiNoticeTone: "info" as UiNoticeTone,
  uiNoticeTimer: undefined as number | undefined,
  showConversationDrawer: false,
  pendingSessionSubmission: undefined as PendingSessionSubmission | undefined,
  nextPendingSessionRequestId: 0,
  cancelledPendingSessionRequestIds: new Set<number>(),
};

export function getCurrentState() {
  return state.currentState;
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

export function getDraftLlmProfile() {
  return state.draftLlmProfile;
}

function getActiveLlmProfile() {
  return state.currentState.llmProfile ?? state.draftLlmProfile;
}

export async function loadDraftLlmProfile() {
  const stored = await chrome.storage.local.get(LLM_PROFILE_STORAGE_KEY);
  const storedProfile = normalizeLlmProfile(stored[LLM_PROFILE_STORAGE_KEY]);
  state.draftLlmProfile = storedProfile ?? state.draftLlmProfile;
  return state.draftLlmProfile;
}

export async function persistDraftLlmProfile(profile: LlmProfile) {
  state.draftLlmProfile = profile;
  await chrome.storage.local.set({ [LLM_PROFILE_STORAGE_KEY]: profile });
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

export function toggleConversationDrawer() {
  state.showConversationDrawer = !state.showConversationDrawer;
  return state.showConversationDrawer;
}

export function openConversationDrawer() {
  state.showConversationDrawer = true;
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

function getCurrentProgressText() {
  if (state.pendingSessionSubmission && state.currentState.status === "idle") {
    return optimisticAssistantProgressText;
  }

  if (state.currentState.status === "running") {
    return navigator.language.startsWith("zh") ? "正在处理请求..." : "Working on it...";
  }

  return state.currentState.error ?? state.currentState.finalResult?.summary ?? messages.assistantWaiting;
}

function getActiveSearchPreference() {
  return state.currentState.status === "running"
    ? state.currentState.searchPreference ?? state.draftSearchPreference
    : state.draftSearchPreference;
}

function getFinalResultDisplayMarkdown() {
  return (
    state.currentState.finalResult?.markdown?.trim() ||
    state.currentState.finalResult?.artifacts.find((artifact) => artifact.kind === "markdown")?.content?.trim() ||
    state.currentState.streamingFinalDraft?.markdown?.trim() ||
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
  const hasLlmProfile = Object.prototype.hasOwnProperty.call(next, "llmProfile");

  state.currentState = {
    ...createBaseState(),
    ...next,
    availableConversations: hasAvailableConversations ? next.availableConversations : state.currentState.availableConversations,
    conversationTurns: hasConversationTurns ? next.conversationTurns : state.currentState.conversationTurns,
    conversationId: hasConversationId ? next.conversationId : state.currentState.conversationId,
    conversationTitle: hasConversationTitle ? next.conversationTitle : state.currentState.conversationTitle,
  };
  if (hasLlmProfile && next.llmProfile) {
    state.draftLlmProfile = next.llmProfile;
  }
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
    finalResultDisplayMarkdown: getFinalResultDisplayMarkdown(),
    documentArtifacts: getDocumentArtifacts(),
    selectedLlmProfile: getActiveLlmProfile(),
    conversationUiText,
    messages,
  };
}
