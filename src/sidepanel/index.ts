import { DEFAULT_GOAL } from "../shared/constants";
import type {
  DebugLogEntry,
  ResearchSourceResult,
  SessionPublicState,
  SnapshotData,
  StepRecord,
  TaskSpec,
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

function formatValue(value: string | number | boolean | undefined) {
  if (value === undefined || value === "") {
    return messages.emptyValue;
  }
  return String(value);
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
    bodyRows.push(
      `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
    );
    index += 1;
  }

  const headerHtml = `<tr>${headerCells.map((cell) => `<th>${cell}</th>`).join("")}</tr>`;
  const bodyHtml = bodyRows.join("");

  return {
    html: `
      <div class="markdown-table-wrap">
        <table class="markdown-table">
          <thead>${headerHtml}</thead>
          <tbody>${bodyHtml}</tbody>
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
      const content = renderInlineMarkdown(headingMatch[2]);
      parts.push(`<h${level} class="markdown-h${level}">${content}</h${level}>`);
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

function renderSection(title: string, content: string, open = false) {
  return `
    <section class="section">
      <details class="section-details"${open ? " open" : ""}>
        <summary class="section-summary"><h2>${escapeHtml(title)}</h2></summary>
        <div class="section-body">${content}</div>
      </details>
    </section>
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

function renderPlanStep(step: SessionPublicState["plan"][number], index: number) {
  return `
    <div class="timeline-item">
      <div class="timeline-head">
        <span>${index + 1}. ${escapeHtml(step.goal)}</span>
        <span class="pill">${escapeHtml(step.status)}</span>
      </div>
      <div class="timeline-body">
        <div><strong>Step ID：</strong>${escapeHtml(step.stepId)}</div>
        <div><strong>Allowed Tools：</strong>${escapeHtml(step.allowedTools.join(", ") || messages.emptyValue)}</div>
        <div><strong>Success Criteria：</strong>${escapeHtml(step.successCriteria.join(" / ") || messages.emptyValue)}</div>
      </div>
    </div>
  `;
}

function renderSnapshot(snapshot: SnapshotData | undefined) {
  if (!snapshot) {
    return `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  }

  const resultList = snapshot.pageFacts.resultList;
  const searchResults = snapshot.pageFacts.searchResults;
  const pageContent = snapshot.pageFacts.pageContent;
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
        <div class="debug-value">${escapeHtml(
          resultList
            ? `${resultList.cardCount} cards / ${resultList.productLinkCount} links`
            : searchResults
              ? `${searchResults.naturalCount} natural / ${searchResults.adCount} ads`
              : pageContent
                ? `${pageContent.textLength} chars`
                : messages.emptyValue,
        )}</div>
        <div class="muted">${
          resultList
            ? `loaded=${escapeHtml(formatValue(resultList.loaded))} empty=${escapeHtml(formatValue(resultList.emptyState))}`
            : searchResults
              ? `loaded=${escapeHtml(formatValue(searchResults.loaded))} total=${escapeHtml(formatValue(searchResults.resultCount))}`
              : pageContent
                ? `readable=${escapeHtml(formatValue(pageContent.readable))} paragraphs=${escapeHtml(formatValue(pageContent.paragraphCount))}`
                : escapeHtml(messages.emptyValue)
        }</div>
      </div>
    </div>
    <details class="debug-detail">
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

  const notesText = taskSpec.notes.length > 0 ? taskSpec.notes.join(" / ") : messages.emptyValue;

  if (taskSpec.taskType === "public_research") {
    return `
      <div class="debug-grid">
        <div class="debug-card">
          <span class="status-label">${escapeHtml(messages.taskType)}</span>
          <div class="debug-value">${escapeHtml(messages.taskTypeLabels[taskSpec.taskType])}</div>
        </div>
        <div class="debug-card">
          <span class="status-label">${escapeHtml(messages.querySearchEngine)}</span>
          <div class="debug-value">${escapeHtml(taskSpec.searchEngine)}</div>
        </div>
        <div class="debug-card">
          <span class="status-label">${escapeHtml(messages.queryTopK)}</span>
          <div class="debug-value">${escapeHtml(String(taskSpec.sourceTargetCount))}</div>
        </div>
        <div class="debug-card">
          <span class="status-label">${escapeHtml(messages.querySource)}</span>
          <div class="debug-value">${escapeHtml(taskSpec.querySource)}</div>
        </div>
        <div class="debug-card" style="grid-column: 1 / -1;">
          <span class="status-label">${escapeHtml(messages.querySearch)}</span>
          <div class="debug-value">${escapeHtml(taskSpec.searchQuery)}</div>
          <div class="muted">${escapeHtml(notesText)}</div>
        </div>
      </div>
    `;
  }

  const categoryText = formatValue(taskSpec.category);
  const budgetText = taskSpec.budget ? `${taskSpec.budget} 元` : messages.emptyValue;

  return `
    <div class="debug-grid">
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.taskType)}</span>
        <div class="debug-value">${escapeHtml(messages.taskTypeLabels[taskSpec.taskType])}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.queryCategory)}</span>
        <div class="debug-value">${escapeHtml(categoryText)}</div>
      </div>
      <div class="debug-card">
        <span class="status-label">${escapeHtml(messages.queryBudget)}</span>
        <div class="debug-value">${escapeHtml(budgetText)}</div>
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
        <div class="muted">${escapeHtml(notesText)}</div>
      </div>
    </div>
  `;
}

function renderFilterDiagnostics() {
  const diagnostics = currentState.filterDiagnostics;
  if (!diagnostics) {
    return `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`;
  }

  if (diagnostics.kind === "research") {
    return `
      <div class="debug-grid">
        <div class="debug-card">
          <span class="status-label">${escapeHtml(messages.rawItems)}</span>
          <div class="debug-value">${escapeHtml(String(diagnostics.inputCount))}</div>
        </div>
        <div class="debug-card">
          <span class="status-label">${escapeHtml(messages.filterFinal)}</span>
          <div class="debug-value">${escapeHtml(String(diagnostics.finalCount))}</div>
        </div>
        <div class="debug-card">
          <span class="status-label">Skipped Ads</span>
          <div class="debug-value">${escapeHtml(String(diagnostics.skippedAdCount))}</div>
        </div>
        <div class="debug-card">
          <span class="status-label">Skipped Internal/PDF</span>
          <div class="debug-value">${escapeHtml(String(diagnostics.skippedInternalCount + diagnostics.skippedPdfCount))}</div>
        </div>
      </div>
    `;
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

function renderOverallStatus() {
  const status = currentState.finalResult?.overallStatus;
  if (!status) {
    return "";
  }

  const label =
    status === "success" ? messages.resultOk : status === "partial" ? messages.resultPartial : messages.resultFail;
  return `<p class="muted"><strong>${escapeHtml(messages.summary)}：</strong>${escapeHtml(label)}</p>`;
}

function renderResearchSources(sources: ResearchSourceResult[] | undefined) {
  if (!sources || sources.length === 0) {
    return `<div class="muted">${escapeHtml(messages.noSources)}</div>`;
  }

  return sources
    .map((source, index) => {
      const statusLabel =
        source.status === "success" ? messages.resultOk : source.status === "partial" ? messages.resultPartial : messages.resultFail;
      const points =
        source.keyPoints.length > 0
          ? `<ul class="debug-list">${source.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`
          : `<div class="muted">${escapeHtml(messages.emptyValue)}</div>`;
      const issues =
        source.unresolvedIssues.length > 0
          ? `<ul class="debug-list">${source.unresolvedIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`
          : `<div class="muted">${escapeHtml(messages.issuesEmpty)}</div>`;

      return `
        <details class="source-card">
          <summary class="source-summary">
            <span>${index + 1}. ${escapeHtml(source.pageTitle || source.candidate.title)}</span>
            <span class="pill">${escapeHtml(statusLabel)}</span>
          </summary>
          <div class="source-body">
            <div><strong>${escapeHtml(messages.sourceSummary)}：</strong>${escapeHtml(source.summary || messages.emptyValue)}</div>
            <div><strong>${escapeHtml(messages.sourceLink)}：</strong><a class="result-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.sourceUrl)}</a></div>
            <div><strong>${escapeHtml(messages.sourcePoints)}：</strong>${points}</div>
            <div><strong>${escapeHtml(messages.sourceIssues)}：</strong>${issues}</div>
          </div>
        </details>
      `;
    })
    .join("");
}

function renderResultsSection() {
  const taskSpec = currentState.taskSpec;
  const isResearch = taskSpec?.taskType === "public_research" || (currentState.researchSources?.length ?? 0) > 0;

  if (isResearch) {
    return `
      ${renderMarkdownBlock(currentState.finalOutput)}
      ${renderOverallStatus()}
      <div class="timeline">${renderResearchSources(currentState.researchSources)}</div>
    `;
  }

  const itemsRows =
    currentState.items.length > 0
      ? currentState.items
          .map(
            (item) => `
              <tr>
                <td><a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></td>
                <td>${escapeHtml(item.priceText)}</td>
                <td>${escapeHtml(item.shopText ?? messages.unknownShop)}</td>
                <td>${escapeHtml(item.summary ?? (item.tags?.join(" / ") ?? messages.unknownSummary))}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="4" class="muted">${escapeHtml(messages.noItems)}</td></tr>`;

  return `
    ${renderMarkdownBlock(currentState.finalOutput)}
    ${renderOverallStatus()}
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
  `;
}

function render() {
  const timeline = [
    ...(currentState.plan.length
      ? [
          `<div class="timeline-item">
            <div class="timeline-head"><span>${escapeHtml(messages.timelinePlan)}</span><span>${currentState.plan.length} ${escapeHtml(messages.timelineSteps)}</span></div>
            <div class="timeline-body">${currentState.plan.map((item, index) => renderPlanStep(item, index)).join("")}</div>
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

  const issuesMarkup =
    currentState.unresolvedIssues && currentState.unresolvedIssues.length > 0
      ? `<ul class="debug-list">${currentState.unresolvedIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`
      : `<div class="muted">${escapeHtml(messages.issuesEmpty)}</div>`;

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
            <span class="status-label">${escapeHtml(messages.taskType)}</span>
            <span class="status-value">${escapeHtml(currentState.taskType ? messages.taskTypeLabels[currentState.taskType] : "-")}</span>
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
            <span class="status-label">${escapeHtml(messages.sources)}</span>
            <span class="status-value">${currentState.researchSources?.length ?? 0}</span>
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

      ${renderSection(messages.timelineTitle, `<div class="timeline">${timeline || `<div class="muted">${escapeHtml(messages.timelineWaiting)}</div>`}</div>`)}
      ${renderSection(messages.queryTitle, renderTaskSpec())}
      ${renderSection(messages.filterTitle, renderFilterDiagnostics())}
      ${renderSection(messages.debugTitle, renderSnapshot(currentState.pageSnapshot))}
      ${renderSection(
        messages.recoveryTitle,
        `<div class="timeline">${currentState.recoveryHint ? escapeHtml(currentState.recoveryHint) : `<div class="muted">${escapeHtml(messages.recoveryEmpty)}</div>`}</div>`,
      )}
      ${renderSection(messages.logsTitle, `<div class="logs">${logsMarkup}</div>`)}
      ${renderSection(messages.issuesTitle, issuesMarkup)}

      <section class="section">
        <h2>${escapeHtml(messages.resultsTitle)}</h2>
        ${renderResultsSection()}
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
