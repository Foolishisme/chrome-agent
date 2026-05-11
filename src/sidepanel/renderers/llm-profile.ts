import type { LlmProfile } from "../../shared/agent-domain-model";
import type { RenderState } from "./sidepanel-rendering-primitives";
import { escapeHtml } from "./sidepanel-rendering-primitives";

function getProfileLabel(profile: LlmProfile) {
  if (profile === "local") {
    return "本地推理";
  }

  return "云端大模型";
}

export function renderLlmProfileSelector(renderState: RenderState) {
  const conversationRunning = renderState.currentState.status === "running" || Boolean(renderState.pendingSessionSubmission);
  const selectedProfile = renderState.selectedLlmProfile;

  return `
    <div class="llm-profile-selector" role="group" aria-label="模型切换" title="切换后将在下一次对话生效">
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
  `;
}
