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
import { renderLlmProfileSelector } from "./renderers/llm-profile";
import { renderResultsSection } from "./renderers/results";
import { hasFailureState, renderRuntimeSection } from "./renderers/runtime";
import {
  getBrowserAgentWindow,
  getCurrentState,
  getPendingSessionSubmission,
  getRenderState,
  loadDraftLlmProfile,
  setDraftGoal,
  persistDraftLlmProfile,
  toggleDraftSearchPreference,
} from "./state";

const app = document.getElementById("app")!;

function syncLiveElapsedTicker() {
  const ticker = getBrowserAgentWindow().__browserAgentElapsedTicker;
  const shouldRun = getCurrentState().status === "running";

  if (!shouldRun) {
    if (ticker !== undefined) {
      window.clearInterval(ticker);
      delete getBrowserAgentWindow().__browserAgentElapsedTicker;
    }
    return;
  }

  if (ticker !== undefined) {
    return;
  }

  getBrowserAgentWindow().__browserAgentElapsedTicker = window.setInterval(() => {
    if (!app.isConnected || getCurrentState().status !== "running") {
      syncLiveElapsedTicker();
      return;
    }

    render();
  }, 1000);
}

function render() {
  syncLiveElapsedTicker();

  const renderState = getRenderState();
  const showResultsSection =
    Boolean(renderState.currentState.finalResult) &&
    (renderState.currentState.finalResult?.outputMode === "artifact" || renderState.documentArtifacts.length > 0);
  const showRuntimeSection = hasFailureState(renderState);

  app.innerHTML = `
    <div class="panel-shell">
      <section class="hero">
        <div class="hero-layout">
          <div class="hero-copy">
            <h1>${renderState.messages.heroTitle}</h1>
            <p>${renderState.messages.heroDescription}</p>
          </div>
          ${renderLlmProfileSelector(renderState)}
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
      ${showRuntimeSection ? renderTopLevelSection(renderState.messages.runtimeStatusTitle, renderRuntimeSection(renderState), true) : ""}
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
