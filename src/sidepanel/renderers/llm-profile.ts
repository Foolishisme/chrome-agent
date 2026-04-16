import type { LlmProfile } from "../../shared/types";
import type { RenderState } from "./common";
import { escapeHtml } from "./common";

function getProfileLabel(profile: LlmProfile) {
  const zh = navigator.language.startsWith("zh");
  if (profile === "local") {
    return zh ? "本地" : "Local";
  }

  return zh ? "外部" : "External";
}

function getSelectorHint() {
  return navigator.language.startsWith("zh") ? "切换后下次启动生效" : "Takes effect on the next run";
}

export function renderLlmProfileSelector(renderState: RenderState) {
  const conversationRunning = renderState.currentState.status === "running" || Boolean(renderState.pendingSessionSubmission);
  const selectedProfile = renderState.selectedLlmProfile;

  return `
    <div class="llm-profile-card">
      <div class="llm-profile-card-label">LLM</div>
      <div class="llm-profile-card-buttons" role="group" aria-label="LLM profile selector">
        <button
          type="button"
          class="llm-profile-button${selectedProfile === "external" ? " llm-profile-button-active" : ""}"
          data-llm-profile="external"
          aria-pressed="${selectedProfile === "external"}"
          ${conversationRunning ? "disabled" : ""}
        >
          ${escapeHtml(getProfileLabel("external"))}
        </button>
        <button
          type="button"
          class="llm-profile-button${selectedProfile === "local" ? " llm-profile-button-active" : ""}"
          data-llm-profile="local"
          aria-pressed="${selectedProfile === "local"}"
          ${conversationRunning ? "disabled" : ""}
        >
          ${escapeHtml(getProfileLabel("local"))}
        </button>
      </div>
      <div class="llm-profile-card-hint">${escapeHtml(getSelectorHint())}</div>
    </div>
  `;
}
