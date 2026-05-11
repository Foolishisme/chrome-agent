import type { SessionPublicState } from "../shared/types";
import {
  copyArtifact,
  copyLiveResult,
  copyTurn,
  createConversation,
  deleteConversation,
  downloadArtifactByIndex,
  handleRuntimeUpdate,
  requestSessionState,
  rollbackConversation,
  selectConversation,
  startSession,
  stopSession,
  toggleConversationPanel,
} from "./actions";
import { renderConversationSection } from "./renderers/conversation";
import { renderTopLevelSection } from "./renderers/common";
import { renderResultsSection } from "./renderers/results";
import {
  getCurrentState,
  getPendingSessionSubmission,
  getRenderState,
  loadDraftLlmProfile,
  setDraftGoal,
  persistDraftLlmProfile,
  toggleDraftSearchPreference,
} from "./state";

const app = document.getElementById("app")!;

function render() {
  const renderState = getRenderState();
  const showResultsSection =
    Boolean(renderState.currentState.finalResult) &&
    (renderState.currentState.finalResult?.outputMode === "artifact" || renderState.documentArtifacts.length > 0);

  const isRunning = renderState.currentState.status === "running" || Boolean(renderState.pendingSessionSubmission);

  app.innerHTML = `
    ${isRunning ? '<div class="global-progress-bar"></div>' : ''}
    <div class="panel-shell">
      <section class="hero">
        <div class="hero-layout">
          <div class="hero-icon">
            <svg style="position: absolute; top: -2px; left: -8px; width: 14px; height: 14px; color: #d6cab8;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"/></svg>
            <svg style="position: absolute; top: 14px; left: -14px; width: 10px; height: 10px; color: #e2dcd2;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"/></svg>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <circle cx="10" cy="11" r="1.5" fill="#fbf5e9"></circle>
              <circle cx="16" cy="11" r="1.5" fill="#fbf5e9"></circle>
            </svg>
          </div>
          <div class="hero-copy">
            <h1>${renderState.messages.heroTitle}</h1>
            <p>${renderState.messages.heroDescription}</p>
          </div>
          <button id="toggle-conversations-button" type="button" class="hero-action-button" title="历史记录">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
        </div>
      </section>

      ${renderTopLevelSection(renderState.messages.conversationTitle, renderConversationSection(renderState), true)}
      ${
        showResultsSection
          ? `
            <section class="section">
              <h2>${renderState.messages.resultsTitle}</h2>
              ${renderResultsSection(renderState)}
            </section>
          `
          : ""
      }
    </div>
  `;
}

app.addEventListener("input", (event) => {
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLTextAreaElement) || target.id !== "goal-input") {
    return;
  }

  setDraftGoal(target.value);
});

app.addEventListener("keydown", async (event) => {
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLTextAreaElement) || target.id !== "goal-input") {
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    if (getCurrentState().status === "running" || getPendingSessionSubmission()) {
      return;
    }

    event.preventDefault();
    await startSession(target.value, render);
  }
});

app.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
    "button, [data-select-conversation-id], [data-rollback-turn-id], [data-copy-turn-id], [data-copy-live-result], [data-copy-artifact-index], [data-download-artifact-index], [data-llm-profile]",
  );
  if (!target) {
    return;
  }

  if (target.dataset.copyArtifactIndex || target.dataset.downloadArtifactIndex) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (target.id === "search-preference-toggle") {
    toggleDraftSearchPreference();
    target.classList.toggle("goal-input-search-toggle-active", getRenderState().activeSearchPreference === "prefer_search");
    target.setAttribute("aria-pressed", String(getRenderState().activeSearchPreference === "prefer_search"));
    target.setAttribute(
      "title",
      getRenderState().activeSearchPreference === "prefer_search"
        ? getRenderState().messages.searchToggleHintPreferSearch
        : getRenderState().messages.searchToggleHintAuto,
    );
    return;
  }

  if (target.dataset.llmProfile) {
    event.preventDefault();
    const nextProfile = target.dataset.llmProfile === "local" ? "local" : "external";
    try {
      await persistDraftLlmProfile(nextProfile);
    } catch {
      // Keep the in-memory selection even if local persistence is unavailable.
    }
    render();
    return;
  }

  if (target.id === "start-button") {
    const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
    await startSession(goalInput?.value ?? "", render);
    return;
  }

  if (target.id === "stop-button") {
    await stopSession(render);
    return;
  }

  if (target.id === "toggle-conversations-button") {
    await toggleConversationPanel(render);
    return;
  }

  if (target.id === "create-conversation-button") {
    await createConversation(render);
    return;
  }

  if (target.id === "delete-conversation-button") {
    await deleteConversation(render);
    return;
  }

  if (target.dataset.selectConversationId) {
    await selectConversation(target.dataset.selectConversationId, render);
    return;
  }

  if (target.dataset.rollbackTurnId) {
    await rollbackConversation(Number.parseInt(target.dataset.rollbackTurnId, 10), render);
    return;
  }

  if (target.dataset.copyTurnId) {
    await copyTurn(Number.parseInt(target.dataset.copyTurnId, 10), render);
    return;
  }

  if (target.dataset.copyLiveResult) {
    await copyLiveResult(render);
    return;
  }

  if (target.dataset.copyArtifactIndex) {
    await copyArtifact(Number.parseInt(target.dataset.copyArtifactIndex, 10), render);
    return;
  }

  if (target.dataset.downloadArtifactIndex) {
    downloadArtifactByIndex(Number.parseInt(target.dataset.downloadArtifactIndex, 10), render);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SESSION_UPDATE" || message.type === "SESSION_ERROR") {
    handleRuntimeUpdate(message.payload as SessionPublicState, render);
  }
});

async function bootstrap() {
  try {
    await loadDraftLlmProfile();
    await requestSessionState(render);
  } catch {
    render();
  }
}

render();
void bootstrap();
