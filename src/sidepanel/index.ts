import type { SessionStateResponse, StartSessionResponse } from "../shared/protocol";
import type {
  ConversationTurn,
  DebugLogEntry,
  PlanStep,
  ResultArtifact,
  SearchPreference,
  SessionPublicState,
  StepRecord,
} from "../shared/types";
import { getMessages } from "./i18n";

const app = document.getElementById("app")!;
const messages = getMessages();
const archiveUiText = navigator.language.startsWith("zh")
  ? {
      currentConversation: "当前会话",
      newConversation: "新建会话",
      conversationHistoryEmpty: "还没有历史会话。",
      conversationTurnsEmpty: "当前会话还没有历史轮次。",
      userTurn: "提问",
      assistantTurn: "回答",
      rollbackTurn: "回退到此轮",
      deleteConversation: "删除会话",
      createConversationReady: "已创建新会话。",
      createConversationFailed: "创建新会话失败。",
      deleteConversationReady: "已删除当前会话。",
      deleteConversationFailed: "删除当前会话失败。",
      selectConversationFailed: "切换历史会话失败。",
      rollbackConversationReady: "已回退到选中轮次。",
      rollbackConversationFailed: "回退会话失败。",
      untitledConversation: "未命名会话",
    }
  : {
      currentConversation: "Current Conversation",
      newConversation: "New Conversation",
      conversationHistoryEmpty: "No archived conversations yet.",
      conversationTurnsEmpty: "This conversation has no turns yet.",
      userTurn: "User",
      assistantTurn: "Assistant",
      rollbackTurn: "Rollback Here",
      deleteConversation: "Delete Conversation",
      createConversationReady: "Created a new conversation.",
      createConversationFailed: "Failed to create a new conversation.",
      deleteConversationReady: "Deleted the current conversation.",
      deleteConversationFailed: "Failed to delete the current conversation.",
      selectConversationFailed: "Failed to switch conversations.",
      rollbackConversationReady: "Rolled back to the selected turn.",
      rollbackConversationFailed: "Failed to roll back the conversation.",
      untitledConversation: "Untitled Conversation",
    };
const conversationInputPlaceholder = "你想知道什么";
const emptyGoalNotice = "请先输入问题。";

Object.assign(archiveUiText, {
  currentConversation: "当前会话",
  newConversation: "新建会话",
  conversationHistoryEmpty: "还没有历史会话。",
  conversationTurnsEmpty: "当前会话还没有历史内容。",
  userTurn: "提问",
  assistantTurn: "回答",
  rollbackTurn: "回退到此轮",
  deleteConversation: "删除会话",
  createConversationReady: "已创建新会话。",
  createConversationFailed: "创建新会话失败。",
  deleteConversationReady: "已删除当前会话。",
  deleteConversationFailed: "删除当前会话失败。",
  selectConversationFailed: "切换历史会话失败。",
  rollbackConversationReady: "已回退到选中轮次。",
  rollbackConversationFailed: "回退会话失败。",
  untitledConversation: "未命名会话",
});

let currentState: SessionPublicState = {
  status: "idle",
  currentStep: 0,
  plan: [],
  items: [],
  logs: [],
  timeline: [],
  updatedAt: Date.now(),
};

let draftGoal = "";
let draftSearchPreference: SearchPreference = "auto";
let uiNotice = "";
let uiNoticeTone: "info" | "error" = "info";
let uiNoticeTimer: number | undefined;
let showConversationDrawer = false;
const browserAgentWindow = window as Window & typeof globalThis & { __browserAgentElapsedTicker?: number };
let pendingSessionSubmission:
  | {
      requestId: number;
      goal: string;
      searchPreference: SearchPreference;
      startedAt: number;
    }
  | undefined;
let nextPendingSessionRequestId = 0;
const cancelledPendingSessionRequestIds = new Set<number>();
const optimisticAssistantProgressText = navigator.language.startsWith("zh")
  ? "正在理解问题并启动会话..."
  : "Understanding the question and starting the session...";

function hasSessionActivity() {
  return (
    Boolean(pendingSessionSubmission) ||
    currentState.status !== "idle" ||
    currentState.timeline.length > 0 ||
    currentState.logs.length > 0 ||
    Boolean(currentState.finalResult) ||
    Boolean(currentState.error)
  );
}

function getCurrentProgressText() {
  if (pendingSessionSubmission && currentState.status === "idle") {
    return optimisticAssistantProgressText;
  }

  return currentState.error ?? currentState.stepSummary ?? currentState.finalResult?.summary ?? messages.assistantWaiting;
}

function getActiveSearchPreference() {
  return currentState.status === "running" ? currentState.searchPreference ?? draftSearchPreference : draftSearchPreference;
}

function escapeHtml(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDuration(ms: number | undefined) {
  if (ms === undefined) {
    return messages.emptyValue;
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCompactDuration(ms: number | undefined) {
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

function getDisplayedElapsedMs() {
  if (currentState.elapsedMs !== undefined) {
    if (currentState.status !== "running") {
      return currentState.elapsedMs;
    }

    return currentState.elapsedMs + Math.max(0, Date.now() - currentState.updatedAt);
  }

  return getTimelineDurationMs(currentState.timeline);
}

function formatTimelineElapsedLabel(elapsedMs: number | undefined, completed: boolean) {
  if (elapsedMs === undefined) {
    return "";
  }

  if (!completed) {
    return formatDuration(elapsedMs);
  }

  const compact = formatCompactDuration(elapsedMs);
  return navigator.language.startsWith("zh") ? `${compact}完成` : `Done in ${compact}`;
}

function syncLiveElapsedTicker() {
  const ticker = browserAgentWindow.__browserAgentElapsedTicker;
  const shouldRun = currentState.status === "running";

  if (!shouldRun) {
    if (ticker !== undefined) {
      window.clearInterval(ticker);
      delete browserAgentWindow.__browserAgentElapsedTicker;
    }
    return;
  }

  if (ticker !== undefined) {
    return;
  }

  browserAgentWindow.__browserAgentElapsedTicker = window.setInterval(() => {
    if (!app.isConnected || currentState.status !== "running") {
      syncLiveElapsedTicker();
      return;
    }

    render();
  }, 1000);
}

function getFinalResultDisplayMarkdown() {
  return (
    currentState.finalResult?.markdown?.trim() ||
    currentState.finalResult?.artifacts.find((artifact) => artifact.kind === "markdown")?.content?.trim() ||
    currentState.finalResult?.summary?.trim() ||
    ""
  );
}

function getDefaultResultCopyText() {
  return getFinalResultDisplayMarkdown();
}

function setUiNotice(message: string, tone: "info" | "error" = "info") {
  uiNotice = message;
  uiNoticeTone = tone;

  if (uiNoticeTimer !== undefined) {
    window.clearTimeout(uiNoticeTimer);
  }

  uiNoticeTimer = window.setTimeout(() => {
    uiNotice = "";
    uiNoticeTimer = undefined;
    render();
  }, 2500);

  render();
}

async function requestSessionState() {
  const response = (await chrome.runtime.sendMessage({
    type: "REQUEST_SESSION_STATE",
  })) as SessionStateResponse;

  if (!response.ok) {
    throw new Error(response.error || "Failed to load the current session state.");
  }

  if (response.payload) {
    applyState(response.payload);
  }

  return response;
}

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

function downloadArtifact(artifact: ResultArtifact) {
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

function getDocumentArtifacts() {
  return (currentState.finalResult?.artifacts ?? []).filter((artifact) => artifact.kind === "markdown");
}

function renderInlineMarkdown(text: unknown) {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="result-link" href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function isMarkdownTableSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => renderInlineMarkdown(cell.trim()));
}

function renderMarkdownTable(lines: string[], startIndex: number) {
  const headerCells = parseMarkdownTableRow(lines[startIndex] ?? "");
  const bodyRows: string[] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const current = lines[index]?.trim() ?? "";
    if (!current || !current.includes("|")) {
      break;
    }

    const cells = parseMarkdownTableRow(current);
    bodyRows.push(`<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`);
    index += 1;
  }

  return {
    html: `
      <div class="markdown-table-wrap">
        <table class="markdown-table">
          <thead><tr>${headerCells.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>
          <tbody>${bodyRows.join("")}</tbody>
        </table>
      </div>
    `,
    nextIndex: index - 1,
  };
}

function renderMarkdownBlock(markdown: string | undefined) {
  if (!markdown) {
    return `<div class="muted">${escapeHtml(messages.resultsHint)}</div>`;
  }

  const lines = markdown.split(/\r?\n/);
  const parts: string[] = [];
  let listItems: string[] = [];
  let listTag: "ul" | "ol" | undefined;

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    const tag = listTag ?? "ul";
    parts.push(`<${tag} class="markdown-list">${listItems.join("")}</${tag}>`);
    listItems = [];
    listTag = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const nextTrimmed = lines[index + 1]?.trim() ?? "";
    if (trimmed.includes("|") && isMarkdownTableSeparator(nextTrimmed)) {
      flushList();
      const table = renderMarkdownTable(lines, index);
      parts.push(table.html);
      index = table.nextIndex;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      parts.push(`<h${level} class="markdown-h${level}">${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listTag && listTag !== "ol") {
        flushList();
      }
      listTag = "ol";
      listItems.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      if (listTag && listTag !== "ul") {
        flushList();
      }
      listTag = "ul";
      listItems.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    flushList();
    parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  return `<div class="markdown-output">${parts.join("")}</div>`;
}

function renderTopLevelSection(title: string, content: string, open = true, summaryMeta?: string) {
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

function renderNestedDetails(title: string, content: string, open = false, summaryMeta?: string) {
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

function renderLogItem(log: DebugLogEntry) {
  const detail = log.detail
    ? `<details class="log-detail"><summary>${escapeHtml(messages.logDetail)}</summary><pre>${escapeHtml(log.detail)}</pre></details>`
    : "";

  return `
    <div class="log-item log-${escapeHtml(log.level)}">
      <div class="log-head">
        <span>[${escapeHtml(log.source)}]</span>
        <span>${new Date(log.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="log-message">${escapeHtml(log.message)}</div>
      ${detail}
    </div>
  `;
}

function renderPlanStep(step: PlanStep, detailRecords: StepRecord[]) {
  const allowedTools = step.allowedTools.length > 0 ? step.allowedTools.join(", ") : messages.emptyValue;
  const criteria =
    step.successCriteria.length > 0
      ? step.successCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li>${escapeHtml(messages.emptyValue)}</li>`;
  const detailsMarkup =
    detailRecords.length > 0
      ? `<div class="timeline-sublist">${detailRecords.map((record) => renderTimelineStep(record)).join("")}</div>`
      : `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  const shouldOpen = step.status === "running" || step.status === "failed" || step.status === "blocked";

  return `
    <details class="source-card"${shouldOpen ? " open" : ""}>
      <summary class="source-summary">
        <span>${escapeHtml(step.goal)}</span>
        <span class="pill">${escapeHtml(messages.stepStatusLabels[step.status])}</span>
      </summary>
      <div class="source-body">
        <div><strong>${escapeHtml(messages.currentStepId)}:</strong> ${escapeHtml(step.stepId)}</div>
        <div><strong>${escapeHtml(messages.planTools)}:</strong> ${escapeHtml(allowedTools)}</div>
        <div><strong>${escapeHtml(messages.planCriteria)}:</strong></div>
        <ul class="debug-list">${criteria}</ul>
        ${detailsMarkup}
      </div>
    </details>
  `;
}

function renderTimelineStep(step: StepRecord) {
  return `
    <div class="timeline-item">
      <div class="timeline-head">
        <span>#${step.step} ${escapeHtml(step.stepSummary)}</span>
        <span>${new Date(step.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="timeline-body">
        <div><strong>${escapeHtml(messages.timelineAction)}:</strong> ${escapeHtml(step.action?.type ?? messages.emptyValue)}</div>
        <div><strong>${escapeHtml(messages.timelineResult)}:</strong> ${escapeHtml(step.actionResult?.message ?? messages.emptyValue)}</div>
        <div><strong>${escapeHtml(messages.timelineExpected)}:</strong> ${escapeHtml(step.expectedOutcome ?? messages.emptyValue)}</div>
        <div><strong>${escapeHtml(messages.timelineSnapshot)}:</strong> ${escapeHtml(step.snapshotSummary ?? messages.emptyValue)}</div>
      </div>
    </div>
  `;
}

function renderTimelineList(records: StepRecord[]) {
  if (records.length === 0) {
    return `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  }

  return `<div class="timeline">${records.map((record) => renderTimelineStep(record)).join("")}</div>`;
}

function renderConversationTurnTimeline(records: StepRecord[], open = false, isRunning = false) {
  if (records.length === 0 && !isRunning) {
    return "";
  }

  const durationMs = isRunning ? getDisplayedElapsedMs() : getTimelineDurationMs(records);
  const compact = durationMs !== undefined ? formatCompactDuration(durationMs) : "";
  let customizedTitle = "";
  if (navigator.language.startsWith("zh")) {
    customizedTitle = isRunning ? `思考中 ${compact}` : `已思考 ${compact}`;
  } else {
    customizedTitle = isRunning ? `Thinking ${compact}` : `Thought for ${compact}`;
  }

  return `
    <details class="timeline-details"${open ? " open" : ""} style="margin-bottom: 12px;">
      <summary style="cursor: pointer; color: #7b6e62; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: list-item;">
        <span>${escapeHtml(customizedTitle)}</span>
      </summary>
      <div class="section-body">${renderTimelineList(records)}</div>
    </details>
  `;
}

function hasSavedTurnForSession(sessionId: string | undefined) {
  if (!sessionId) {
    return false;
  }

  return (currentState.conversationTurns ?? []).some((turn) => turn.sessionId === sessionId);
}

function renderSavedConversationTurn(turn: ConversationTurn) {
  return `
    <div class="conversation-turn-pair">
      <div class="conversation-turn-row conversation-turn-row-user">
        <div class="conversation-turn conversation-turn-user">
          ${
            currentState.conversationId
              ? `
                <div class="conversation-turn-user-actions">
                  <button
                    type="button"
                    class="action-icon-button"
                    title="${escapeHtml(archiveUiText.rollbackTurn)}"
                    data-rollback-turn-id="${turn.turnId}"
                    ${currentState.status === "running" ? "disabled" : ""}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                  </button>
                </div>
              `
              : ""
          }
          <div class="conversation-turn-body">${escapeHtml(turn.goal)}</div>
        </div>
      </div>
      <div class="conversation-turn-row conversation-turn-row-assistant">
        <div class="conversation-turn conversation-turn-assistant">
          <div class="conversation-turn-body">
            ${renderConversationTurnTimeline(turn.timeline, false, false)}
            ${renderMarkdownBlock(turn.answerMarkdown)}
          </div>
          <div class="conversation-turn-assistant-footer">
            <button
              type="button"
              class="action-icon-button"
              title="${escapeHtml(messages.resultCopyButton)}"
              data-copy-turn-id="${turn.turnId}"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLiveConversationTurn() {
  const liveGoal = currentState.goal ?? pendingSessionSubmission?.goal;
  const hasOptimisticTurn = Boolean(pendingSessionSubmission) && currentState.status === "idle";

  if (!liveGoal || (!hasOptimisticTurn && currentState.status === "idle") || hasSavedTurnForSession(currentState.sessionId)) {
    return "";
  }

  const liveCopyText = getFinalResultDisplayMarkdown();
  const assistantBody = currentState.finalResult
    ? renderMarkdownBlock(getFinalResultDisplayMarkdown())
    : `<p class="muted">${escapeHtml(getCurrentProgressText())}</p>`;

  return `
    <div class="conversation-turn-pair conversation-turn-pair-live">
      <div class="conversation-turn-row conversation-turn-row-user">
        <div class="conversation-turn conversation-turn-user">
          <div class="conversation-turn-body">${escapeHtml(liveGoal)}</div>
        </div>
      </div>
      <div class="conversation-turn-row conversation-turn-row-assistant">
        <div class="conversation-turn conversation-turn-assistant">
          <div class="conversation-turn-body">
            ${
              currentState.finalResult
                ? `${currentState.status === "running" ? renderConversationTurnTimeline(currentState.timeline, true, true) : renderConversationTurnTimeline(currentState.timeline, false, false)}${assistantBody}`
                : `<div class="conversation-turn-body-pending">${renderConversationTurnTimeline(currentState.timeline, true, true)}${assistantBody}</div>`
            }
          </div>
          ${
            liveCopyText
              ? `
                <div class="conversation-turn-assistant-footer">
                  <button
                    type="button"
                    class="action-icon-button"
                    title="${escapeHtml(messages.resultCopyButton)}"
                    data-copy-live-result="true"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                </div>
              `
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function renderConversationThread() {
  const savedTurns = currentState.conversationTurns ?? [];
  const liveTurn = renderLiveConversationTurn();

  if (savedTurns.length === 0 && !liveTurn) {
    return `<div class="muted">${escapeHtml(archiveUiText.conversationTurnsEmpty)}</div>`;
  }

  return `
    <div class="conversation-thread">
      ${savedTurns.map((turn) => renderSavedConversationTurn(turn)).join("")}
      ${liveTurn}
    </div>
  `;
}

function renderConversationSection() {
  const conversationActionsDisabled = currentState.status === "running" || Boolean(pendingSessionSubmission);
  const activeSearchPreference = getActiveSearchPreference();
  const actionButton =
    currentState.status === "running" || Boolean(pendingSessionSubmission)
      ? `<button id="stop-button" type="button" class="goal-input-action-button goal-input-stop-button" title="${escapeHtml(messages.stop)}">⏹</button>`
      : `<button id="start-button" type="button" class="goal-input-action-button goal-input-start-button" title="${escapeHtml(messages.start)}">↑</button>`;
  const currentConversationTitle = currentState.conversationTitle ?? archiveUiText.untitledConversation;
  const conversationHistory =
    (currentState.availableConversations ?? []).length > 0
      ? (currentState.availableConversations ?? [])
          .map(
            (conversation) => `
              <button
                type="button"
                class="conversation-list-item${conversation.conversationId === currentState.conversationId ? " conversation-list-item-active" : ""}"
                data-select-conversation-id="${escapeHtml(conversation.conversationId)}"
                ${conversationActionsDisabled ? "disabled" : ""}
              >
                <span>${escapeHtml(conversation.title)}</span>
                <span class="conversation-meta">${escapeHtml(conversation.turnCount)}</span>
              </button>
            `,
          )
          .join("")
      : `<div class="muted">${escapeHtml(archiveUiText.conversationHistoryEmpty)}</div>`;

  return `
    <div class="controls">
      <div class="conversation-toolbar">
        <button id="toggle-conversations-button" type="button" class="button-secondary action-button">
          ${escapeHtml(archiveUiText.currentConversation)}: ${escapeHtml(currentConversationTitle)}
        </button>
        <button id="create-conversation-button" type="button" class="button-secondary action-button" ${conversationActionsDisabled ? "disabled" : ""}>
          ${escapeHtml(archiveUiText.newConversation)}
        </button>
      </div>
      ${
        showConversationDrawer
          ? `
            <div class="conversation-drawer">
              <div class="conversation-drawer-head">历史会话</div>
              <div class="conversation-drawer-list">${conversationHistory}</div>
              <div class="conversation-drawer-actions">
                ${
                  currentState.conversationId
                    ? `
                      <button
                        id="delete-conversation-button"
                        type="button"
                        class="button-secondary action-button"
                        ${conversationActionsDisabled ? "disabled" : ""}
                      >
                        ${escapeHtml(archiveUiText.deleteConversation)}
                      </button>
                    `
                    : ""
                }
              </div>
            </div>
          `
          : ""
      }
      ${renderConversationThread()}
      <div class="goal-input-shell">
        <textarea id="goal-input" class="goal-input" placeholder="${escapeHtml(conversationInputPlaceholder)}">${escapeHtml(draftGoal)}</textarea>
        <div class="goal-input-actions">
          <button
            id="search-preference-toggle"
            type="button"
            class="goal-input-search-toggle${activeSearchPreference === "prefer_search" ? " goal-input-search-toggle-active" : ""}"
            aria-pressed="${activeSearchPreference === "prefer_search"}"
            aria-label="${escapeHtml(messages.searchToggleLabel)}"
            title="${escapeHtml(activeSearchPreference === "prefer_search" ? messages.searchToggleHintPreferSearch : messages.searchToggleHintAuto)}"
            ${conversationActionsDisabled ? "disabled" : ""}
          >
            <span style="display: flex; align-items: center; gap: 4px; font-size: 13px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>
              <span>联网检索</span>
            </span>
          </button>
          ${actionButton}
        </div>
      </div>
    </div>
  `;
}

function buildTimelineMarkup() {
  const stepRecordsByPlanStep = new Map<string, StepRecord[]>();
  const orphanRecords: StepRecord[] = [];

  for (const record of currentState.timeline) {
    if (!record.planStepId) {
      orphanRecords.push(record);
      continue;
    }

    const matchedPlanStep = currentState.plan.find((step) => step.stepId === record.planStepId);
    if (!matchedPlanStep) {
      orphanRecords.push(record);
      continue;
    }

    const existing = stepRecordsByPlanStep.get(record.planStepId) ?? [];
    existing.push(record);
    stepRecordsByPlanStep.set(record.planStepId, existing);
  }

  const planTimelineMarkup =
    currentState.plan.length > 0
      ? currentState.plan.map((step) => renderPlanStep(step, stepRecordsByPlanStep.get(step.stepId) ?? [])).join("")
      : currentState.timeline.length > 0
        ? currentState.timeline.map((step) => renderTimelineStep(step)).join("")
        : `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;

  const orphanMarkup =
    orphanRecords.length > 0
      ? `<div class="timeline-sublist">${orphanRecords.map((record) => renderTimelineStep(record)).join("")}</div>`
      : "";

  return `
    <div class="timeline">
      ${planTimelineMarkup}
      ${orphanMarkup}
    </div>
  `;
}

function renderExecutionTrace(open: boolean) {
  if (currentState.plan.length === 0 && currentState.timeline.length === 0) {
    return "";
  }

  return renderNestedDetails(
    messages.timelineTitle,
    buildTimelineMarkup(),
    open,
    formatTimelineElapsedLabel(getDisplayedElapsedMs(), currentState.status === "done"),
  );
}

function hasFailureState() {
  const finalStatus = currentState.finalResult?.status;
  return currentState.status === "error" || finalStatus === "failed" || finalStatus === "blocked";
}

function renderRuntimeSection() {
  const currentProgress = getCurrentProgressText();
  const runtimeHeadline = `
    <div class="debug-grid" style="margin-bottom: 12px;">
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(messages.userGoal)}</span>
        <div class="debug-value">${escapeHtml(currentState.goal ?? draftGoal)}</div>
      </div>
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(messages.assistantSummary)}</span>
        <div class="debug-value">${escapeHtml(currentProgress)}</div>
      </div>
    </div>
  `;

  const runtimeSummary = `
    <div class="status-grid">
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.runtime)}</span>
        <span class="status-value"><span class="pill">${escapeHtml(messages.statusLabels[currentState.status])}</span></span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.taskType)}</span>
        <span class="status-value">${escapeHtml(currentState.taskType ? messages.taskTypeLabels[currentState.taskType] : messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.step)}</span>
        <span class="status-value">${escapeHtml(currentState.currentStep)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.currentStepId)}</span>
        <span class="status-value">${escapeHtml(currentState.currentStepId ?? messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.currentTool)}</span>
        <span class="status-value">${escapeHtml(currentState.currentTool ?? messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.elapsed)}</span>
        <span class="status-value">${escapeHtml(formatDuration(currentState.elapsedMs))}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.budget)}</span>
        <span class="status-value">${escapeHtml(currentState.budgetLow ? messages.budgetLow : messages.budgetHealthy)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.session)}</span>
        <span class="status-value">${escapeHtml(currentState.sessionId?.slice(0, 8) ?? messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.items)}</span>
        <span class="status-value">${escapeHtml(currentState.items.length)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(messages.sources)}</span>
        <span class="status-value">${escapeHtml(currentState.researchSources?.length ?? 0)}</span>
      </div>
    </div>
  `;

  const logsMarkup =
    currentState.logs.length > 0
      ? `<div class="logs">${currentState.logs.map((log) => renderLogItem(log)).join("")}</div>`
      : `<div class="muted">${escapeHtml(messages.logsEmpty)}</div>`;

  return `
    ${runtimeHeadline}
    ${runtimeSummary}
    ${renderExecutionTrace(true)}
    ${renderNestedDetails(messages.logsTitle, logsMarkup)}
    ${renderRuntimeDetailsSection()}
  `;
}

function renderArtifactDetail(title: string, content: string, open = false) {
  return `
    <details class="source-card"${open ? " open" : ""}>
      <summary class="source-summary">
        <span>${escapeHtml(title)}</span>
      </summary>
      <div class="source-body">${content}</div>
    </details>
  `;
}

function renderDocumentArtifact(artifact: ResultArtifact, index: number) {
  return `
    <div class="source-card">
      <div class="source-summary document-summary">
        <span>${escapeHtml(artifact.title)}</span>
        <span class="document-actions">
          <button
            type="button"
            class="button-secondary action-button action-button-small"
            data-copy-artifact-index="${index}"
          >
            ${escapeHtml(messages.documentCopyButton)}
          </button>
          <button
            type="button"
            class="button-secondary action-button action-button-small"
            data-download-artifact-index="${index}"
          >
            ${escapeHtml(messages.documentDownloadButton)}
          </button>
        </span>
      </div>
    </div>
  `;
}

function renderStructuredItems() {
  if (currentState.items.length === 0) {
    return `<div class="muted">${escapeHtml(messages.noItems)}</div>`;
  }

  const rows = currentState.items
    .map(
      (item, index) => `
        <details class="source-card">
          <summary class="source-summary">
            <span>${index + 1}. ${escapeHtml(item.title)}</span>
            <span class="pill">${escapeHtml(item.priceText || messages.emptyValue)}</span>
          </summary>
          <div class="source-body">
            <div><strong>${escapeHtml(messages.price)}:</strong> ${escapeHtml(item.priceText || messages.emptyValue)}</div>
            <div><strong>${escapeHtml(messages.shop)}:</strong> ${escapeHtml(item.shopText ?? messages.unknownShop)}</div>
            <div><strong>${escapeHtml(messages.summary)}:</strong> ${escapeHtml(item.summary ?? (item.tags?.join(" / ") ?? messages.unknownSummary))}</div>
            <div><strong>${escapeHtml(messages.sourceLink)}:</strong> <a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>
          </div>
        </details>
      `,
    )
    .join("");

  return `<div class="timeline">${rows}</div>`;
}

function renderStructuredSources() {
  if ((currentState.researchSources?.length ?? 0) === 0) {
    return `<div class="muted">${escapeHtml(messages.noSources)}</div>`;
  }

  return `
    <div class="timeline">
      ${
        currentState.researchSources
          ?.map((source, index) => {
            const statusLabel =
              source.status === "success"
                ? messages.resultOk
                : source.status === "partial"
                  ? messages.resultPartial
                  : messages.resultFail;
            const issues =
              source.unresolvedIssues.length > 0
                ? `<ul class="debug-list">${source.unresolvedIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`
                : `<div class="muted">${escapeHtml(messages.emptyValue)}</div>`;

            return `
              <details class="source-card">
                <summary class="source-summary">
                  <span>${index + 1}. ${escapeHtml(source.pageTitle || source.candidate.title)}</span>
                  <span class="pill">${escapeHtml(statusLabel)}</span>
                </summary>
                <div class="source-body">
                  <div><strong>${escapeHtml(messages.sourceExcerpt)}:</strong> ${escapeHtml(source.bodyExcerpt || messages.emptyValue)}</div>
                  <div><strong>${escapeHtml(messages.sourceLink)}:</strong> <a class="result-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.sourceUrl)}</a></div>
                  <div><strong>${escapeHtml(messages.sourceIssues)}:</strong> ${issues}</div>
                </div>
              </details>
            `;
          })
          .join("") ?? ""
      }
    </div>
  `;
}

function renderStructuredIssues() {
  const issues = currentState.finalResult?.errorsOrBlockers ?? currentState.unresolvedIssues ?? [];
  if (issues.length === 0) {
    return `<div class="muted">${escapeHtml(messages.emptyValue)}</div>`;
  }

  return `<ul class="debug-list">${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`;
}

function renderRuntimeDetailsSection() {
  const detailSections: string[] = [];

  if (currentState.items.length > 0) {
    detailSections.push(renderArtifactDetail(messages.resultItemsTitle, renderStructuredItems()));
  }

  if ((currentState.researchSources?.length ?? 0) > 0) {
    detailSections.push(renderArtifactDetail(messages.resultSourcesTitle, renderStructuredSources()));
  }

  if ((currentState.finalResult?.errorsOrBlockers.length ?? currentState.unresolvedIssues?.length ?? 0) > 0) {
    detailSections.push(renderArtifactDetail(messages.resultIssuesTitle, renderStructuredIssues()));
  }

  if (currentState.finalResult?.suggestedNextAction) {
    detailSections.push(
      renderArtifactDetail(
        messages.resultNextActionTitle,
        `<p>${escapeHtml(currentState.finalResult.suggestedNextAction)}</p>`,
      ),
    );
  }

  if (detailSections.length === 0) {
    return "";
  }

  return renderNestedDetails(
    messages.runtimeDetailsTitle,
    `<div class="timeline">${detailSections.join("")}</div>`,
  );
}

function renderResultsSection() {
  const documentArtifacts = getDocumentArtifacts();
  const outputMode = currentState.finalResult?.outputMode ?? (documentArtifacts.length > 0 ? "artifact" : "inline");
  const errorMarkup = currentState.error ? `<div class="error-box">${escapeHtml(currentState.error)}</div>` : "";
  const noticeMarkup = uiNotice ? `<div class="notice-box notice-${uiNoticeTone}">${escapeHtml(uiNotice)}</div>` : "";

  const documentsMarkup =
    documentArtifacts.length > 0
      ? `
        <div class="timeline">
          ${renderArtifactDetail(
            messages.resultDocumentsTitle,
            documentArtifacts.map((artifact, index) => renderDocumentArtifact(artifact, index)).join(""),
            true,
          )}
        </div>
        `
      : "";

  if (!currentState.finalResult) {
    return "";
  }

  if (outputMode === "inline") {
    return "";
  }

  if (outputMode === "artifact") {
    return `
      ${errorMarkup}
      ${noticeMarkup}
      ${documentsMarkup || `<div class="muted">${escapeHtml(messages.documentEmpty)}</div>`}
    `;
  }

  return "";
}

function render() {
  syncLiveElapsedTicker();

  const showResultsSection =
    Boolean(currentState.finalResult) &&
    (currentState.finalResult?.outputMode === "artifact" || getDocumentArtifacts().length > 0);
  const showRuntimeSection = hasFailureState();

  app.innerHTML = `
    <div class="panel-shell">
      <section class="hero">
        <h1>${escapeHtml(messages.heroTitle)}</h1>
        <p>${escapeHtml(messages.heroDescription)}</p>
      </section>

      ${renderTopLevelSection(messages.conversationTitle, renderConversationSection(), true)}
      ${
        showResultsSection
          ? `
            <section class="section">
              <h2>${escapeHtml(messages.resultsTitle)}</h2>
              ${renderResultsSection()}
            </section>
          `
          : ""
      }
      ${showRuntimeSection ? renderTopLevelSection(messages.runtimeStatusTitle, renderRuntimeSection(), true) : ""}
    </div>
  `;

  const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
  const searchPreferenceToggle = document.getElementById("search-preference-toggle");
  const startButton = document.getElementById("start-button");
  const stopButton = document.getElementById("stop-button");
  const toggleConversationsButton = document.getElementById("toggle-conversations-button");
  const createConversationButton = document.getElementById("create-conversation-button");
  const deleteConversationButton = document.getElementById("delete-conversation-button");

  goalInput?.addEventListener("input", () => {
    draftGoal = goalInput.value;
  });

  goalInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (currentState.status === "running" || pendingSessionSubmission) {
        return;
      }

      e.preventDefault();
      startButton?.click();
    }
  });

  searchPreferenceToggle?.addEventListener("click", () => {
    draftSearchPreference = draftSearchPreference === "prefer_search" ? "auto" : "prefer_search";
    render();
  });

  startButton?.addEventListener("click", async () => {
    const goal = goalInput?.value.trim() ?? "";
    if (!goal) {
      setUiNotice(emptyGoalNotice, "error");
      return;
    }

    const requestId = ++nextPendingSessionRequestId;
    pendingSessionSubmission = {
      requestId,
      goal,
      searchPreference: draftSearchPreference,
      startedAt: Date.now(),
    };
    draftGoal = "";
    render();

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "START_SESSION",
        goal,
        searchPreference: draftSearchPreference,
      })) as StartSessionResponse;

      if (!response.ok) {
        throw new Error(response.error || "启动会话失败");
      }

      if (cancelledPendingSessionRequestIds.delete(requestId)) {
        return;
      }

      if (response.payload) {
        applyState(response.payload);
      }
    } catch (error) {
      if (cancelledPendingSessionRequestIds.delete(requestId)) {
        return;
      }

      pendingSessionSubmission = undefined;
      draftGoal = goal;
      render();
      setUiNotice(error instanceof Error ? error.message : "启动会话失败", "error");
    }
  });

  stopButton?.addEventListener("click", async () => {
    if (pendingSessionSubmission) {
      cancelledPendingSessionRequestIds.add(pendingSessionSubmission.requestId);
      pendingSessionSubmission = undefined;
      render();
    }

    await chrome.runtime.sendMessage({
      type: "STOP_SESSION",
    });
  });

  toggleConversationsButton?.addEventListener("click", async () => {
    showConversationDrawer = !showConversationDrawer;
    if (showConversationDrawer) {
      try {
        await requestSessionState();
      } catch {
        setUiNotice(archiveUiText.selectConversationFailed, "error");
      }
    } else {
      render();
    }
  });

  createConversationButton?.addEventListener("click", async () => {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "CREATE_CONVERSATION",
      })) as SessionStateResponse;

      if (!response.ok) {
        throw new Error(response.error || archiveUiText.createConversationFailed);
      }

      showConversationDrawer = true;
      if (response.payload) {
        applyState(response.payload);
      }
      draftGoal = "";
      setUiNotice(archiveUiText.createConversationReady);
    } catch {
      setUiNotice(archiveUiText.createConversationFailed, "error");
    }
  });

  deleteConversationButton?.addEventListener("click", async () => {
    if (!currentState.conversationId) {
      setUiNotice(archiveUiText.deleteConversationFailed, "error");
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
        applyState(response.payload);
      }
      setUiNotice(archiveUiText.deleteConversationReady);
    } catch {
      setUiNotice(archiveUiText.deleteConversationFailed, "error");
    }
  });

  document.querySelectorAll<HTMLElement>("[data-select-conversation-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const conversationId = button.dataset.selectConversationId;
      if (!conversationId) {
        return;
      }

      try {
        const response = (await chrome.runtime.sendMessage({
          type: "SELECT_CONVERSATION",
          conversationId,
        })) as SessionStateResponse;

        if (!response.ok) {
          throw new Error(response.error || archiveUiText.selectConversationFailed);
        }

        if (response.payload) {
          applyState(response.payload);
        }
      } catch {
        setUiNotice(archiveUiText.selectConversationFailed, "error");
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-rollback-turn-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!currentState.conversationId) {
        setUiNotice(archiveUiText.rollbackConversationFailed, "error");
        return;
      }

      const turnId = Number.parseInt(button.dataset.rollbackTurnId ?? "", 10);
      if (!Number.isFinite(turnId)) {
        setUiNotice(archiveUiText.rollbackConversationFailed, "error");
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
          applyState(response.payload);
        }
        setUiNotice(archiveUiText.rollbackConversationReady);
      } catch {
        setUiNotice(archiveUiText.rollbackConversationFailed, "error");
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-copy-turn-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const turnId = Number.parseInt(button.dataset.copyTurnId ?? "", 10);
      if (!Number.isFinite(turnId)) {
        setUiNotice(messages.resultCopyUnavailable, "error");
        return;
      }

      const turn = (currentState.conversationTurns ?? []).find((item) => item.turnId === turnId);
      const text = turn?.answerMarkdown?.trim();
      if (!text) {
        setUiNotice(messages.resultCopyUnavailable, "error");
        return;
      }

      try {
        await copyTextToClipboard(text);
        setUiNotice(messages.resultCopyReady);
      } catch {
        setUiNotice(messages.resultCopyFailed, "error");
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-copy-live-result]").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = getDefaultResultCopyText();
      if (!text) {
        setUiNotice(messages.resultCopyUnavailable, "error");
        return;
      }

      try {
        await copyTextToClipboard(text);
        setUiNotice(messages.resultCopyReady);
      } catch {
        setUiNotice(messages.resultCopyFailed, "error");
      }
    });
  });

  const copyResultButton = document.getElementById("copy-result-button");
  copyResultButton?.addEventListener("click", async () => {
    const text = getDefaultResultCopyText();
    if (!text) {
      setUiNotice(messages.resultCopyUnavailable, "error");
      return;
    }

    try {
      await copyTextToClipboard(text);
      setUiNotice(messages.resultCopyReady);
    } catch {
      setUiNotice(messages.resultCopyFailed, "error");
    }
  });

  document.querySelectorAll<HTMLElement>("[data-copy-artifact-index]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const index = Number.parseInt(button.dataset.copyArtifactIndex ?? "", 10);
      const artifact = getDocumentArtifacts()[index];
      if (!artifact) {
        setUiNotice(messages.documentEmpty, "error");
        return;
      }

      try {
        await copyTextToClipboard(artifact.content);
        setUiNotice(messages.resultCopyReady);
      } catch {
        setUiNotice(messages.resultCopyFailed, "error");
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-download-artifact-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const index = Number.parseInt(button.dataset.downloadArtifactIndex ?? "", 10);
      const artifact = getDocumentArtifacts()[index];
      if (!artifact) {
        setUiNotice(messages.documentEmpty, "error");
        return;
      }

      try {
        downloadArtifact(artifact);
        setUiNotice(messages.downloadReady);
      } catch {
        setUiNotice(messages.downloadFailed, "error");
      }
    });
  });
}

function applyState(next: SessionPublicState | undefined) {
  if (!next) {
    return;
  }

  if (
    pendingSessionSubmission &&
    (next.status !== "idle" || Boolean(next.goal) || Boolean(next.sessionId) || Boolean(next.finalResult) || Boolean(next.error))
  ) {
    pendingSessionSubmission = undefined;
  }

  const hasConversationId = Object.prototype.hasOwnProperty.call(next, "conversationId");
  const hasConversationTitle = Object.prototype.hasOwnProperty.call(next, "conversationTitle");
  const hasConversationTurns = Object.prototype.hasOwnProperty.call(next, "conversationTurns");
  const hasAvailableConversations = Object.prototype.hasOwnProperty.call(next, "availableConversations");

  currentState = {
    status: "idle",
    currentStep: 0,
    plan: [],
    items: [],
    logs: [],
    timeline: [],
    updatedAt: Date.now(),
    ...next,
    availableConversations: hasAvailableConversations ? next.availableConversations : currentState.availableConversations,
    conversationTurns: hasConversationTurns ? next.conversationTurns : currentState.conversationTurns,
    conversationId: hasConversationId ? next.conversationId : currentState.conversationId,
    conversationTitle: hasConversationTitle ? next.conversationTitle : currentState.conversationTitle,
  };
  render();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SESSION_UPDATE" || message.type === "SESSION_ERROR") {
    applyState(message.payload as SessionPublicState);
  }
});

async function bootstrap() {
  try {
    await requestSessionState();
  } catch {
    render();
  }
}

render();
void bootstrap();
