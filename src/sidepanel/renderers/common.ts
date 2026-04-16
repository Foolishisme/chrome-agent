import type { ArchiveUiText, Messages } from "../ui-text";
import type { PendingSessionSubmission, UiNoticeTone } from "../state";
import type { LlmProfile, ResultArtifact, SearchPreference, SessionPublicState, StepRecord } from "../../shared/types";

export interface RenderState {
  currentState: SessionPublicState;
  draftGoal: string;
  uiNotice: string;
  uiNoticeTone: UiNoticeTone;
  showConversationDrawer: boolean;
  pendingSessionSubmission?: PendingSessionSubmission;
  activeSearchPreference: SearchPreference;
  currentProgressText: string;
  displayedElapsedMs?: number;
  finalResultDisplayMarkdown: string;
  documentArtifacts: ResultArtifact[];
  selectedLlmProfile: LlmProfile;
  archiveUiText: ArchiveUiText;
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

export function formatDuration(ms: number | undefined, messages: Messages) {
  if (ms === undefined) {
    return messages.emptyValue;
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatCompactDuration(ms: number | undefined, messages: Messages) {
  if (ms === undefined) {
    return messages.emptyValue;
  }

  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return navigator.language.startsWith("zh") ? `${totalSeconds}秒` : `${totalSeconds}s`;
  }

  if (navigator.language.startsWith("zh")) {
    return seconds === 0 ? `${minutes}分` : `${minutes}分${seconds}秒`;
  }

  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function getTimelineDurationMs(records: StepRecord[]) {
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

export function formatTimelineElapsedLabel(elapsedMs: number | undefined, completed: boolean, messages: Messages) {
  if (elapsedMs === undefined) {
    return "";
  }

  if (!completed) {
    return formatDuration(elapsedMs, messages);
  }

  const compact = formatCompactDuration(elapsedMs, messages);
  return navigator.language.startsWith("zh") ? `${compact}完成` : `Done in ${compact}`;
}

export function renderTopLevelSection(title: string, content: string, open = true, summaryMeta?: string) {
  return `
    <section class="section">
      <details class="section-details"${open ? " open" : ""}>
        <summary class="section-summary">
          <div class="section-summary-content">
            <h2>${escapeHtml(title)}</h2>
            ${
              summaryMeta
                ? `<span class="summary-meta" data-timeline-elapsed="true">${escapeHtml(summaryMeta)}</span>`
                : ""
            }
          </div>
        </summary>
        <div class="section-body">${content}</div>
      </details>
    </section>
  `;
}

export function renderNestedDetails(title: string, content: string, open = false, summaryMeta?: string) {
  return `
    <details class="debug-detail"${open ? " open" : ""}>
      <summary class="debug-detail-summary">
        <span class="debug-detail-title">${escapeHtml(title)}</span>
        ${
          summaryMeta
            ? `<span class="summary-meta" data-timeline-elapsed="true">${escapeHtml(summaryMeta)}</span>`
            : ""
        }
      </summary>
      <div class="section-body">${content}</div>
    </details>
  `;
}
