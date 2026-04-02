import { DEFAULT_GOAL } from "../shared/constants";
import type { DebugLogEntry, SessionPublicState, SnapshotData, StepRecord } from "../shared/types";
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(value: string | number | boolean | undefined) {
  if (value === undefined || value === "") {
    return messages.emptyValue;
  }
  return String(value);
}

function renderInlineMarkdown(text: string) {
  return escapeHtml(text).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="result-link" href="$2" target="_blank">$1</a>');
}

function renderMarkdownBlock(markdown: string | undefined) {
  if (!markdown) {
    return `<div class="muted">${escapeHtml(messages.resultsHint)}</div>`;
  }

  const lines = markdown.split(/\r?\n/);
  const parts: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    parts.push(`<ul class="debug-list">${listItems.join("")}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      parts.push(`<h3>${renderInlineMarkdown(trimmed.slice(3))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      listItems.push(`<li>${renderInlineMarkdown(trimmed.slice(2))}</li>`);
      continue;
    }

    flushList();
    parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  return `<div class="markdown-output">${parts.join("")}</div>`;
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

function renderTimelineStep(step: StepRecord) {
  return `
    <div class="timeline-item">
      <div class="timeline-head">
        <span>#${step.step} ${escapeHtml(step.stepSummary)}</span>
        <span>${new Date(step.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="timeline-body">
        <div><strong>${escapeHtml(messages.timelineAction)}：</strong>${escapeHtml(step.action?.type ?? messages.emptyValue)}</div>
        <div><strong>${escapeHtml(messages.timelineResult)}：</strong>${escapeHtml(step.actionResult?.message ?? messages.emptyValue)}</div>
        <div><strong>${escapeHtml(messages.timelineExpected)}：</strong>${escapeHtml(step.expectedOutcome ?? messages.emptyValue)}</div>
        <div><strong>${escapeHtml(messages.timelineSnapshot)}：</strong>${escapeHtml(step.snapshotSummary ?? messages.emptyValue)}</div>
      </div>
    </div>
  `;
}

function renderSnapshot(snapshot: SnapshotData | undefined) {
  if (!snapshot) {
    return `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  }

  const resultList = snapshot.pageFacts.resultList;
  const checks = snapshot.pageReady.checks.length
    ? snapshot.pageReady.checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${escapeHtml(messages.emptyValue)}</li>`;

  return `
    <div class="debug-grid">
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.pageTitle)}</span>
        <div class="debug-value">${escapeHtml(snapshot.title || messages.emptyValue)}</div>
        <div class="muted">${escapeHtml(snapshot.url)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.pageType)}</span>
        <div class="debug-value">${escapeHtml(snapshot.pageType)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.pageReady)}</span>
        <div class="debug-value">${escapeHtml(snapshot.pageReady.ready ? messages.resultOk : messages.resultFail)}</div>
        <div class="muted">${escapeHtml(messages.pageReadyReason)}：${escapeHtml(snapshot.pageReady.reason)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.searchBox)}</span>
        <div class="debug-value">${escapeHtml(formatValue(snapshot.pageFacts.searchBox.present))}</div>
        <div class="muted">visible=${escapeHtml(formatValue(snapshot.pageFacts.searchBox.visible))} value=${escapeHtml(formatValue(snapshot.pageFacts.searchBox.text))}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.searchButton)}</span>
        <div class="debug-value">${escapeHtml(formatValue(snapshot.pageFacts.searchSubmit.present))}</div>
        <div class="muted">visible=${escapeHtml(formatValue(snapshot.pageFacts.searchSubmit.visible))}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.resultList)}</span>
        <div class="debug-value">${escapeHtml(resultList ? `${resultList.cardCount} cards / ${resultList.productLinkCount} links` : messages.emptyValue)}</div>
        <div class="muted">loaded=${escapeHtml(formatValue(resultList?.loaded))} empty=${escapeHtml(formatValue(resultList?.emptyState))}</div>
      </div>
    </div>
    <details class="debug-detail" open>
      <summary>${escapeHtml(messages.pageChecks)}</summary>
      <ul class="debug-list">${checks}</ul>
    </details>
  `;
}

function renderTaskSpec() {
  const taskSpec = currentState.taskSpec;
  if (!taskSpec) {
    return `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  }

  return `
    <div class="debug-grid">
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.queryCategory)}</span>
        <div class="debug-value">${escapeHtml(taskSpec.category)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.queryBudget)}</span>
        <div class="debug-value">${escapeHtml(taskSpec.budget ? `${taskSpec.budget} 元` : messages.emptyValue)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.queryTopK)}</span>
        <div class="debug-value">${escapeHtml(String(taskSpec.topK))}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.querySource)}</span>
        <div class="debug-value">${escapeHtml(taskSpec.querySource)}</div>
      </div>
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(messages.querySearch)}</span>
        <div class="debug-value">${escapeHtml(taskSpec.searchQuery)}</div>
        <div class="muted">${escapeHtml(taskSpec.notes.join(" / ") || messages.emptyValue)}</div>
      </div>
    </div>
  `;
}

function renderFilterDiagnostics() {
  const diagnostics = currentState.filterDiagnostics;
  if (!diagnostics) {
    return `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  }

  return `
    <div class="debug-grid">
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.rawItems)}</span>
        <div class="debug-value">${escapeHtml(String(currentState.rawItemCount ?? 0))}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">Deduped</span>
        <div class="debug-value">${escapeHtml(String(diagnostics.dedupedCount))}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.filterBudget)}</span>
        <div class="debug-value">${escapeHtml(diagnostics.budgetRangeText ?? messages.emptyValue)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.filterFinal)}</span>
        <div class="debug-value">${escapeHtml(String(diagnostics.finalCount))}</div>
        <div class="muted">budget matched=${escapeHtml(String(diagnostics.budgetMatchedCount))} requested=${escapeHtml(String(diagnostics.requestedTopK))} llm=${escapeHtml(String(diagnostics.llmInputLimit))}</div>
      </div>
    </div>
  `;
}

function render() {
  const itemsRows =
    currentState.items.length > 0
      ? currentState.items
          .map(
            (item) => `
              <tr>
                <td><a class="result-link" href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title)}</a></td>
                <td>${escapeHtml(item.priceText)}</td>
                <td>${escapeHtml(item.shopText ?? messages.unknownShop)}</td>
                <td>${escapeHtml(item.summary ?? (item.tags?.join(" / ") ?? messages.unknownSummary))}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="4" class="muted">${escapeHtml(messages.noItems)}</td></tr>`;

  const timeline = [
    ...(currentState.plan.length
      ? [
          `<div class="timeline-item">
            <div class="timeline-head"><span>${escapeHtml(messages.timelinePlan)}</span><span>${currentState.plan.length} ${escapeHtml(messages.timelineSteps)}</span></div>
            <div class="timeline-body">${currentState.plan.map((item) => escapeHtml(item)).join("<br />")}</div>
          </div>`,
        ]
      : []),
    ...(currentState.timeline.length > 0 ? currentState.timeline.slice().reverse().map((step) => renderTimelineStep(step)) : []),
  ].join("");

  const logsMarkup =
    currentState.logs.length > 0
      ? currentState.logs
          .slice()
          .reverse()
          .map((log) => renderLogItem(log))
          .join("")
      : `<div class="muted">${escapeHtml(messages.logsEmpty)}</div>`;

  app.innerHTML = `
    <div class="panel-shell">
      <section class="hero">
        <h1>${escapeHtml(messages.heroTitle)}</h1>
        <p>${escapeHtml(messages.heroDescription)}</p>
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.sessionTitle)}</h2>
        <div class="controls">
          <textarea id="goal-input" class="goal-input" placeholder="${escapeHtml(messages.goalPlaceholder)}">${escapeHtml(lastGoal)}</textarea>
          <div class="button-row">
            <button id="start-button" class="button-primary">${escapeHtml(messages.start)}</button>
            <button id="retry-button" class="button-secondary">${escapeHtml(messages.retry)}</button>
            <button id="stop-button" class="button-danger">${escapeHtml(messages.stop)}</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.statusTitle)}</h2>
        <div class="status-grid">
          <div class="status-card">
            <span class="status-label">${escapeHtml(messages.runtime)}</span>
            <span class="status-value"><span class="pill">${escapeHtml(messages.statusLabels[currentState.status])}</span></span>
          </div>
          <div class="status-card">
            <span class="status-label">${escapeHtml(messages.step)}</span>
            <span class="status-value">${currentState.currentStep}</span>
          </div>
          <div class="status-card">
            <span class="status-label">${escapeHtml(messages.items)}</span>
            <span class="status-value">${currentState.items.length}</span>
          </div>
          <div class="status-card">
            <span class="status-label">${escapeHtml(messages.rawItems)}</span>
            <span class="status-value">${currentState.rawItemCount ?? 0}</span>
          </div>
          <div class="status-card">
            <span class="status-label">${escapeHtml(messages.session)}</span>
            <span class="status-value">${escapeHtml(currentState.sessionId?.slice(0, 8) ?? "-")}</span>
          </div>
          <div class="status-card">
            <span class="status-label">Phase</span>
            <span class="status-value">${escapeHtml(currentState.currentPhase ?? "-")}</span>
          </div>
          <div class="status-card">
            <span class="status-label">Tool</span>
            <span class="status-value">${escapeHtml(currentState.currentTool ?? "-")}</span>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.timelineTitle)}</h2>
        <div class="timeline">${timeline || `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`}</div>
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.queryTitle)}</h2>
        ${renderTaskSpec()}
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.filterTitle)}</h2>
        ${renderFilterDiagnostics()}
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.debugTitle)}</h2>
        ${renderSnapshot(currentState.pageSnapshot)}
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.recoveryTitle)}</h2>
        <div class="timeline">${currentState.recoveryHint ? escapeHtml(currentState.recoveryHint) : `<div class="muted">${escapeHtml(messages.recoveryEmpty)}</div>`}</div>
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.logsTitle)}</h2>
        <div class="logs">${logsMarkup}</div>
      </section>

      <section class="section">
        <h2>${escapeHtml(messages.resultsTitle)}</h2>
        ${renderMarkdownBlock(currentState.finalOutput)}
        <table class="result-table">
          <thead>
            <tr>
              <th>${escapeHtml(messages.product)}</th>
              <th>${escapeHtml(messages.price)}</th>
              <th>${escapeHtml(messages.shop)}</th>
              <th>${escapeHtml(messages.summary)}</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
        ${
          currentState.finalSummary
            ? `<p class="muted"><strong>${escapeHtml(messages.recommendation)}：</strong>${escapeHtml(currentState.finalSummary)}</p>`
            : `<p class="muted">${escapeHtml(messages.resultsHint)}</p>`
        }
      </section>

      ${
        currentState.error
          ? `<section class="section"><div class="error-box">${escapeHtml(currentState.error)}</div></section>`
          : ""
      }
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
