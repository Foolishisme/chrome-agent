import { buildTimelineMarkup } from "./conversation";
import {
  escapeHtml,
  formatDuration,
  formatTimelineElapsedLabel,
  renderNestedDetails,
  RenderState,
} from "./common";

function renderLogItem(log: NonNullable<RenderState["currentState"]["logs"]>[number], renderState: RenderState) {
  const detail = log.detail
    ? `<details class="log-detail"><summary>${escapeHtml(renderState.messages.logDetail)}</summary><pre>${escapeHtml(log.detail)}</pre></details>`
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

function renderExecutionTrace(renderState: RenderState, open: boolean) {
  if (renderState.currentState.plan.length === 0 && renderState.currentState.timeline.length === 0) {
    return "";
  }

  return renderNestedDetails(
    renderState.messages.timelineTitle,
    buildTimelineMarkup(renderState),
    open,
    formatTimelineElapsedLabel(renderState.displayedElapsedMs, renderState.currentState.status === "done", renderState.messages),
  );
}

export function hasFailureState(renderState: RenderState) {
  const finalStatus = renderState.currentState.finalResult?.status;
  return renderState.currentState.status === "error" || finalStatus === "failed" || finalStatus === "blocked";
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

function renderStructuredItems(renderState: RenderState) {
  if (renderState.currentState.items.length === 0) {
    return `<div class="muted">${escapeHtml(renderState.messages.noItems)}</div>`;
  }

  const rows = renderState.currentState.items
    .map(
      (item, index) => `
        <details class="source-card">
          <summary class="source-summary">
            <span>${index + 1}. ${escapeHtml(item.title)}</span>
            <span class="pill">${escapeHtml(item.priceText || renderState.messages.emptyValue)}</span>
          </summary>
          <div class="source-body">
            <div><strong>${escapeHtml(renderState.messages.price)}:</strong> ${escapeHtml(item.priceText || renderState.messages.emptyValue)}</div>
            <div><strong>${escapeHtml(renderState.messages.shop)}:</strong> ${escapeHtml(item.shopText ?? renderState.messages.unknownShop)}</div>
            <div><strong>${escapeHtml(renderState.messages.summary)}:</strong> ${escapeHtml(item.summary ?? (item.tags?.join(" / ") ?? renderState.messages.unknownSummary))}</div>
            <div><strong>${escapeHtml(renderState.messages.sourceLink)}:</strong> <a class="result-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>
          </div>
        </details>
      `,
    )
    .join("");

  return `<div class="timeline">${rows}</div>`;
}

function renderStructuredSources(renderState: RenderState) {
  if ((renderState.currentState.researchSources?.length ?? 0) === 0) {
    return `<div class="muted">${escapeHtml(renderState.messages.noSources)}</div>`;
  }

  return `
    <div class="timeline">
      ${
        renderState.currentState.researchSources
          ?.map((source, index) => {
            const statusLabel =
              source.status === "success"
                ? renderState.messages.resultOk
                : source.status === "partial"
                  ? renderState.messages.resultPartial
                  : renderState.messages.resultFail;
            const issues =
              source.unresolvedIssues.length > 0
                ? `<ul class="debug-list">${source.unresolvedIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`
                : `<div class="muted">${escapeHtml(renderState.messages.emptyValue)}</div>`;

            return `
              <details class="source-card">
                <summary class="source-summary">
                  <span>${index + 1}. ${escapeHtml(source.pageTitle || source.candidate.title)}</span>
                  <span class="pill">${escapeHtml(statusLabel)}</span>
                </summary>
                <div class="source-body">
                  <div><strong>${escapeHtml(renderState.messages.sourceExcerpt)}:</strong> ${escapeHtml(source.bodyExcerpt || renderState.messages.emptyValue)}</div>
                  <div><strong>${escapeHtml(renderState.messages.sourceLink)}:</strong> <a class="result-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.sourceUrl)}</a></div>
                  <div><strong>${escapeHtml(renderState.messages.sourceIssues)}:</strong> ${issues}</div>
                </div>
              </details>
            `;
          })
          .join("") ?? ""
      }
    </div>
  `;
}

function renderStructuredIssues(renderState: RenderState) {
  const issues = renderState.currentState.finalResult?.errorsOrBlockers ?? renderState.currentState.unresolvedIssues ?? [];
  if (issues.length === 0) {
    return `<div class="muted">${escapeHtml(renderState.messages.emptyValue)}</div>`;
  }

  return `<ul class="debug-list">${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`;
}

function renderRuntimeDetailsSection(renderState: RenderState) {
  const detailSections: string[] = [];

  if (renderState.currentState.items.length > 0) {
    detailSections.push(renderArtifactDetail(renderState.messages.resultItemsTitle, renderStructuredItems(renderState)));
  }

  if ((renderState.currentState.researchSources?.length ?? 0) > 0) {
    detailSections.push(renderArtifactDetail(renderState.messages.resultSourcesTitle, renderStructuredSources(renderState)));
  }

  if ((renderState.currentState.finalResult?.errorsOrBlockers.length ?? renderState.currentState.unresolvedIssues?.length ?? 0) > 0) {
    detailSections.push(renderArtifactDetail(renderState.messages.resultIssuesTitle, renderStructuredIssues(renderState)));
  }

  if (renderState.currentState.finalResult?.suggestedNextAction) {
    detailSections.push(
      renderArtifactDetail(
        renderState.messages.resultNextActionTitle,
        `<p>${escapeHtml(renderState.currentState.finalResult.suggestedNextAction)}</p>`,
      ),
    );
  }

  if (detailSections.length === 0) {
    return "";
  }

  return renderNestedDetails(
    renderState.messages.runtimeDetailsTitle,
    `<div class="timeline">${detailSections.join("")}</div>`,
  );
}

export function renderRuntimeSection(renderState: RenderState) {
  const runtimeHeadline = `
    <div class="debug-grid" style="margin-bottom: 12px;">
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(renderState.messages.userGoal)}</span>
        <div class="debug-value">${escapeHtml(renderState.currentState.goal ?? renderState.draftGoal)}</div>
      </div>
      <div class="debug-card" style="grid-column: 1 / -1;">
        <span class="status-label">${escapeHtml(renderState.messages.assistantSummary)}</span>
        <div class="debug-value">${escapeHtml(renderState.currentProgressText)}</div>
      </div>
    </div>
  `;

  const runtimeSummary = `
    <div class="status-grid">
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.runtime)}</span>
        <span class="status-value"><span class="pill">${escapeHtml(renderState.messages.statusLabels[renderState.currentState.status])}</span></span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.taskType)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.taskType ? renderState.messages.taskTypeLabels[renderState.currentState.taskType] : renderState.messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.step)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.currentStep)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.currentStepId)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.currentStepId ?? renderState.messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.currentTool)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.currentTool ?? renderState.messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.elapsed)}</span>
        <span class="status-value">${escapeHtml(formatDuration(renderState.currentState.elapsedMs, renderState.messages))}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.budget)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.budgetLow ? renderState.messages.budgetLow : renderState.messages.budgetHealthy)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.session)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.sessionId?.slice(0, 8) ?? renderState.messages.emptyValue)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.items)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.items.length)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">${escapeHtml(renderState.messages.sources)}</span>
        <span class="status-value">${escapeHtml(renderState.currentState.researchSources?.length ?? 0)}</span>
      </div>
    </div>
  `;

  const logsMarkup =
    renderState.currentState.logs.length > 0
      ? `<div class="logs">${renderState.currentState.logs.map((log) => renderLogItem(log, renderState)).join("")}</div>`
      : `<div class="muted">${escapeHtml(renderState.messages.logsEmpty)}</div>`;

  return `
    ${runtimeHeadline}
    ${runtimeSummary}
    ${renderExecutionTrace(renderState, true)}
    ${renderNestedDetails(renderState.messages.logsTitle, logsMarkup)}
    ${renderRuntimeDetailsSection(renderState)}
  `;
}
