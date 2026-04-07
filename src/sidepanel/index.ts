import { DEFAULT_GOAL } from "../shared/constants";
import type {
  DebugLogEntry,
  PlanStep,
  SessionPublicState,
  StepRecord,
} from "../shared/types";
import { getMessages } from "./i18n";

const app = document.getElementById("app")!;
const messages = getMessages();

let currentState: SessionPublicState = {
  status: "idle",
  currentStep: 0,
  plan: [],
  items: [],
  logs: [],
  timeline: [],
  updatedAt: Date.now(),
};

let lastGoal = DEFAULT_GOAL;

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

function renderTopLevelSection(title: string, content: string, open = true) {
  return `
    <section class="section">
      <details class="section-details"${open ? " open" : ""}>
        <summary class="section-summary"><h2>${escapeHtml(title)}</h2></summary>
        <div class="section-body">${content}</div>
      </details>
    </section>
  `;
}

function renderNestedDetails(title: string, content: string, open = false) {
  return `
    <details class="debug-detail"${open ? " open" : ""}>
      <summary>${escapeHtml(title)}</summary>
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

function renderConversationSection() {
  const currentProgress = currentState.error ?? currentState.stepSummary ?? currentState.finalSummary ?? messages.assistantWaiting;

  return `
    <div class="controls">
      <textarea id="goal-input" class="goal-input" placeholder="${escapeHtml(messages.goalPlaceholder)}">${escapeHtml(lastGoal)}</textarea>
      <div class="button-row">
        <button id="start-button" class="button-primary">${escapeHtml(messages.start)}</button>
        <button id="retry-button" class="button-secondary">${escapeHtml(messages.retry)}</button>
        <button id="stop-button" class="button-danger">${escapeHtml(messages.stop)}</button>
      </div>
    </div>
    <div class="debug-grid" style="margin-top: 12px;">
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(messages.userGoal)}</span>
        <div class="debug-value">${escapeHtml(currentState.goal ?? lastGoal)}</div>
      </div>
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(messages.assistantSummary)}</span>
        <div class="debug-value">${escapeHtml(currentProgress)}</div>
      </div>
    </div>
  `;
}

function renderRuntimeSection() {
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

  const logsMarkup =
    currentState.logs.length > 0
      ? `<div class="logs">${currentState.logs.map((log) => renderLogItem(log)).join("")}</div>`
      : `<div class="muted">${escapeHtml(messages.logsEmpty)}</div>`;

  return `
    ${runtimeSummary}
    ${renderNestedDetails(
      messages.timelineTitle,
      `
        <div class="timeline">
          ${planTimelineMarkup}
          ${orphanMarkup}
        </div>
      `,
      true,
    )}
    ${renderNestedDetails(messages.logsTitle, logsMarkup)}
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
            const points =
              source.keyPoints.length > 0
                ? `<ul class="debug-list">${source.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`
                : `<div class="muted">${escapeHtml(messages.emptyValue)}</div>`;
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
                  <div><strong>${escapeHtml(messages.sourceSummary)}:</strong> ${escapeHtml(source.summary || messages.emptyValue)}</div>
                  <div><strong>${escapeHtml(messages.sourceLink)}:</strong> <a class="result-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.sourceUrl)}</a></div>
                  <div><strong>${escapeHtml(messages.sourcePoints)}:</strong> ${points}</div>
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
  const issues = currentState.finalResult?.unresolvedIssues ?? currentState.unresolvedIssues ?? [];
  if (issues.length === 0) {
    return `<div class="muted">${escapeHtml(messages.emptyValue)}</div>`;
  }

  return `<ul class="debug-list">${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`;
}

function renderResultsSection() {
  const overallStatus = currentState.finalResult?.overallStatus;
  const overallStatusLabel =
    overallStatus === "success"
      ? messages.resultOk
      : overallStatus === "partial"
        ? messages.resultPartial
        : overallStatus === "failed"
          ? messages.resultFail
          : undefined;
  const errorMarkup = currentState.error ? `<div class="error-box">${escapeHtml(currentState.error)}</div>` : "";
  const artifactSections: string[] = [];

  if (currentState.items.length > 0) {
    artifactSections.push(renderArtifactDetail(messages.resultItemsTitle, renderStructuredItems()));
  }

  if ((currentState.researchSources?.length ?? 0) > 0) {
    artifactSections.push(renderArtifactDetail(messages.resultSourcesTitle, renderStructuredSources()));
  }

  if ((currentState.finalResult?.unresolvedIssues.length ?? currentState.unresolvedIssues?.length ?? 0) > 0) {
    artifactSections.push(renderArtifactDetail(messages.resultIssuesTitle, renderStructuredIssues()));
  }

  return `
    ${errorMarkup}
    ${overallStatusLabel ? `<p class="muted"><strong>${escapeHtml(messages.runtime)}:</strong> ${escapeHtml(overallStatusLabel)}</p>` : ""}
    ${renderMarkdownBlock(currentState.finalOutput)}
    ${
      currentState.finalSummary
        ? `<p class="muted"><strong>${escapeHtml(messages.resultSummaryTitle)}:</strong> ${escapeHtml(currentState.finalSummary)}</p>`
        : `<p class="muted">${escapeHtml(messages.resultsHint)}</p>`
    }
    ${
      artifactSections.length > 0
        ? `
          <div class="timeline">
            ${renderArtifactDetail(messages.resultArtifactsTitle, artifactSections.join(""), true)}
          </div>
        `
        : ""
    }
  `;
}

function render() {
  const shouldOpenRuntime = currentState.status !== "idle" || currentState.timeline.length > 0 || currentState.logs.length > 0;

  app.innerHTML = `
    <div class="panel-shell">
      <section class="hero">
        <h1>${escapeHtml(messages.heroTitle)}</h1>
        <p>${escapeHtml(messages.heroDescription)}</p>
      </section>

      ${renderTopLevelSection(messages.conversationTitle, renderConversationSection(), true)}
      ${renderTopLevelSection(messages.runtimeStatusTitle, renderRuntimeSection(), shouldOpenRuntime)}
      <section class="section">
        <h2>${escapeHtml(messages.resultsTitle)}</h2>
        ${renderResultsSection()}
      </section>
    </div>
  `;

  const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
  const startButton = document.getElementById("start-button");
  const retryButton = document.getElementById("retry-button");
  const stopButton = document.getElementById("stop-button");

  startButton?.addEventListener("click", async () => {
    const goal = goalInput?.value.trim() || DEFAULT_GOAL;
    lastGoal = goal;
    await chrome.runtime.sendMessage({
      type: "START_SESSION",
      goal,
    });
  });

  retryButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "START_SESSION",
      goal: lastGoal,
    });
  });

  stopButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "STOP_SESSION",
    });
  });
}

function applyState(next: SessionPublicState | undefined) {
  if (!next) {
    return;
  }

  currentState = next;
  if (next.goal) {
    lastGoal = next.goal;
  }
  render();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SESSION_UPDATE" || message.type === "SESSION_ERROR") {
    applyState(message.payload as SessionPublicState);
  }
});

async function bootstrap() {
  const response = (await chrome.runtime.sendMessage({
    type: "REQUEST_SESSION_STATE",
  })) as { ok: boolean; payload?: SessionPublicState };

  if (response.ok && response.payload) {
    applyState(response.payload);
  } else {
    render();
  }
}

render();
void bootstrap();
