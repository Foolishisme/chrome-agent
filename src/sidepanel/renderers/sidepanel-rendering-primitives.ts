import type { ConversationUiText, Messages } from "../conversation-ui-text";
import type { PendingSessionSubmission, UiNoticeTone } from "../sidepanel-ui-state";
import type { LlmProfile, ResultArtifact, SearchPreference, SessionPublicState } from "../../shared/agent-domain-model";

export interface RenderState {
  currentState: SessionPublicState;
  draftGoal: string;
  uiNotice: string;
  uiNoticeTone: UiNoticeTone;
  showConversationDrawer: boolean;
  pendingSessionSubmission?: PendingSessionSubmission;
  activeSearchPreference: SearchPreference;
  currentProgressText: string;
  finalResultDisplayMarkdown: string;
  documentArtifacts: ResultArtifact[];
  selectedLlmProfile: LlmProfile;
  conversationUiText: ConversationUiText;
  messages: Messages;
}

export function escapeHtml(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTopLevelSection(title: string, content: string, open = true) {
  return `
    <section class="section">
      <details class="section-details"${open ? " open" : ""}>
        <summary class="section-summary">
          <div class="section-summary-content">
            <h2>${escapeHtml(title)}</h2>
          </div>
        </summary>
        <div class="section-body">${content}</div>
      </details>
    </section>
  `;
}
