import type { ConversationTurn, DebugLogEntry, PlanStep, StepRecord } from "../../shared/types";
import { conversationInputPlaceholder } from "../ui-text";
import { renderMarkdownBlock } from "./markdown";
import {
  escapeHtml,
  formatCompactDuration,
  RenderState,
} from "./common";
import { getTimelineDurationMs } from "./common";
import { renderLlmProfileSelector } from "./llm-profile";

function renderPlanStep(step: PlanStep, detailRecords: StepRecord[], renderState: RenderState) {
  const allowedTools = step.allowedTools.length > 0 ? step.allowedTools.join(", ") : renderState.messages.emptyValue;
  const criteria =
    step.successCriteria.length > 0
      ? step.successCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li>${escapeHtml(renderState.messages.emptyValue)}</li>`;
  const detailsMarkup =
    detailRecords.length > 0
      ? `<div class="timeline-sublist">${detailRecords.map((record) => renderTimelineStep(record, renderState)).join("")}</div>`
      : `<div class="muted">${escapeHtml(renderState.messages.timelineWaiting)}</div>`;
  const shouldOpen = step.status === "running" || step.status === "failed" || step.status === "blocked";

  return `
    <details class="source-card"${shouldOpen ? " open" : ""}>
      <summary class="source-summary">
        <span>${escapeHtml(step.goal)}</span>
        <span class="pill">${escapeHtml(renderState.messages.stepStatusLabels[step.status])}</span>
      </summary>
      <div class="source-body">
        <div><strong>${escapeHtml(renderState.messages.currentStepId)}:</strong> ${escapeHtml(step.stepId)}</div>
        <div><strong>${escapeHtml(renderState.messages.planTools)}:</strong> ${escapeHtml(allowedTools)}</div>
        <div><strong>${escapeHtml(renderState.messages.planCriteria)}:</strong></div>
        <ul class="debug-list">${criteria}</ul>
        ${detailsMarkup}
      </div>
    </details>
  `;
}

export function renderTimelineStep(step: StepRecord, renderState: RenderState) {
  const resultText = step.actionResult?.message ?? "";
  const summary = resultText || step.stepSummary;
  
  const lowerSummary = summary.toLowerCase();
  let statusClass = "timeline-item-default";
  if (lowerSummary.includes("decision: replan")) {
    statusClass = "timeline-item-warning";
  } else if (lowerSummary.includes("decision: finalize") || lowerSummary.includes("final output")) {
    statusClass = "timeline-item-success";
  } else if (lowerSummary.includes("已跳转") || lowerSummary.includes("http")) {
    statusClass = "timeline-item-info";
  }

  return `
    <div class="timeline-item ${statusClass}" title="${escapeHtml(summary)}">
      <div class="timeline-head">
        <span class="timeline-step-number">#${step.step}</span>
        <span class="timeline-content">${escapeHtml(summary)}</span>
        <span class="timeline-timestamp">${new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </div>
    </div>
  `;
}

function renderTimelineList(records: StepRecord[], renderState: RenderState) {
  if (records.length === 0) {
    return `<div class="muted">${escapeHtml(renderState.messages.timelineWaiting)}</div>`;
  }

  return `<div class="timeline">${records.map((record) => renderTimelineStep(record, renderState)).join("")}</div>`;
}

export function renderConversationTurnTimeline(records: StepRecord[], renderState: RenderState, open = false, isRunning = false) {
  if (records.length === 0 && !isRunning) {
    return "";
  }

  const durationMs = isRunning ? renderState.displayedElapsedMs : getTimelineDurationMs(records);
  const compact = durationMs !== undefined ? formatCompactDuration(durationMs, renderState.messages) : "";
  const spinnerHtml = isRunning ? '<span class="thinking-spinner"></span>' : '';
  const customizedTitle = navigator.language.startsWith("zh")
    ? isRunning
      ? `思考中 ${compact}`
      : `已思考 ${compact}`
    : isRunning
      ? `Thinking ${compact}`
      : `Thought for ${compact}`;
  const sparklesSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-accent);"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>`;

  return `
    <details class="timeline-details"${open ? " open" : ""} style="margin-bottom: 12px;">
      <summary style="cursor: pointer; color: var(--color-text-muted); font-weight: 600; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; list-style: none;">
        <div style="display: flex; align-items: center; gap: 6px;">
          ${isRunning ? spinnerHtml : sparklesSvg}
          <span>${escapeHtml(customizedTitle)}</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: ${open ? 'rotate(90deg)' : 'none'}; transition: transform 0.2s;"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </summary>
      <div class="section-body">${renderTimelineList(records, renderState)}</div>
    </details>
  `;
}

function hasSavedTurnForSession(turns: ConversationTurn[] | undefined, sessionId: string | undefined) {
  if (!sessionId) {
    return false;
  }

  return (turns ?? []).some((turn) => turn.sessionId === sessionId);
}

function renderSavedConversationTurn(turn: ConversationTurn, renderState: RenderState) {
  return `
    <div class="conversation-turn-pair">
      <div class="conversation-turn-row conversation-turn-row-user">
        <div class="conversation-turn conversation-turn-user">
          ${
            renderState.currentState.conversationId
              ? `
                <div class="conversation-turn-user-actions">
                  <button
                    type="button"
                    class="action-icon-button"
                    title="${escapeHtml(renderState.archiveUiText.rollbackTurn)}"
                    data-rollback-turn-id="${turn.turnId}"
                    ${renderState.currentState.status === "running" ? "disabled" : ""}
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
            ${renderConversationTurnTimeline(turn.timeline, renderState, false, false)}
            ${renderMarkdownBlock(turn.answerMarkdown, renderState.messages.resultsHint)}
          </div>
          <div class="conversation-turn-assistant-footer">
            <button
              type="button"
              class="action-icon-button"
              title="${escapeHtml(renderState.messages.resultCopyButton)}"
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

function renderLiveConversationTurn(renderState: RenderState) {
  const liveGoal = renderState.currentState.goal ?? renderState.pendingSessionSubmission?.goal;
  const hasOptimisticTurn = Boolean(renderState.pendingSessionSubmission) && renderState.currentState.status === "idle";

  if (
    !liveGoal ||
    (!hasOptimisticTurn && renderState.currentState.status === "idle") ||
    hasSavedTurnForSession(renderState.currentState.conversationTurns, renderState.currentState.sessionId)
  ) {
    return "";
  }

  const liveCopyText = renderState.finalResultDisplayMarkdown;
  const assistantBody = renderState.currentState.finalResult
    ? renderMarkdownBlock(renderState.finalResultDisplayMarkdown, renderState.messages.resultsHint)
    : `<p class="muted">${escapeHtml(renderState.currentProgressText)}</p>`;

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
              renderState.currentState.finalResult
                ? `${renderState.currentState.status === "running" ? renderConversationTurnTimeline(renderState.currentState.timeline, renderState, true, true) : renderConversationTurnTimeline(renderState.currentState.timeline, renderState, false, false)}${assistantBody}`
                : `<div class="conversation-turn-body-pending">${renderConversationTurnTimeline(renderState.currentState.timeline, renderState, true, true)}${assistantBody}</div>`
            }
          </div>
          ${
            liveCopyText
              ? `
                <div class="conversation-turn-assistant-footer">
                  <button
                    type="button"
                    class="action-icon-button"
                    title="${escapeHtml(renderState.messages.resultCopyButton)}"
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

function renderConversationThread(renderState: RenderState) {
  const savedTurns = renderState.currentState.conversationTurns ?? [];
  const liveTurn = renderLiveConversationTurn(renderState);

  if (savedTurns.length === 0 && !liveTurn) {
    return `<div class="muted">${escapeHtml(renderState.archiveUiText.conversationTurnsEmpty)}</div>`;
  }

  return `
    <div class="conversation-thread">
      ${savedTurns.map((turn) => renderSavedConversationTurn(turn, renderState)).join("")}
      ${liveTurn}
    </div>
  `;
}

export function renderConversationSection(renderState: RenderState) {
  const conversationActionsDisabled = renderState.currentState.status === "running" || Boolean(renderState.pendingSessionSubmission);
  const actionButton =
    renderState.currentState.status === "running" || Boolean(renderState.pendingSessionSubmission)
      ? `<button id="stop-button" type="button" class="goal-input-action-button goal-input-stop-button" title="${escapeHtml(renderState.messages.stop)}">◼</button>`
      : `<button id="start-button" type="button" class="goal-input-action-button goal-input-start-button" title="${escapeHtml(renderState.messages.start)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>`;
  const currentConversationTitle = renderState.currentState.conversationTitle ?? renderState.archiveUiText.untitledConversation;
  const conversationHistory =
    (renderState.currentState.availableConversations ?? []).length > 0
      ? (renderState.currentState.availableConversations ?? [])
          .map(
            (conversation) => `
              <button
                type="button"
                class="conversation-list-item${conversation.conversationId === renderState.currentState.conversationId ? " conversation-list-item-active" : ""}"
                data-select-conversation-id="${escapeHtml(conversation.conversationId)}"
                ${conversationActionsDisabled ? "disabled" : ""}
              >
                <span class="conversation-list-icon" style="display: flex; align-items: center; justify-content: center;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </span>
                <span class="conversation-list-content">
                  <span class="conversation-list-title">${escapeHtml(conversation.title)}</span>
                </span>
                <span class="conversation-meta">${escapeHtml(conversation.turnCount)}</span>
              </button>
            `,
          )
          .join("")
      : `<div class="muted">${escapeHtml(renderState.archiveUiText.conversationHistoryEmpty)}</div>`;

  return `
    <div class="controls">
      ${
        renderState.showConversationDrawer
          ? `
            <div class="conversation-drawer">
              <div class="conversation-drawer-head">
                <span>历史会话</span>
                <button id="create-conversation-button" type="button" class="conversation-drawer-create-button" ${conversationActionsDisabled ? "disabled" : ""}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  ${escapeHtml(renderState.archiveUiText.newConversation)}
                </button>
              </div>
              <div class="conversation-drawer-list">${conversationHistory}</div>
              <div class="conversation-drawer-actions">
                ${
                  renderState.currentState.conversationId
                    ? `
                      <button
                        id="delete-conversation-button"
                        type="button"
                        class="conversation-drawer-delete-button"
                        ${conversationActionsDisabled ? "disabled" : ""}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        ${escapeHtml(renderState.archiveUiText.deleteConversation)}
                      </button>
                    `
                    : ""
                }
              </div>
            </div>
          `
          : ""
      }
      ${renderConversationThread(renderState)}
      <div class="goal-input-shell">
        <textarea id="goal-input" class="goal-input" placeholder="${escapeHtml(conversationInputPlaceholder)}">${escapeHtml(renderState.draftGoal)}</textarea>
        <div class="goal-input-actions">
          <div style="display: flex; gap: 6px; align-items: center;">
            <button
              id="search-preference-toggle"
              type="button"
              class="goal-input-search-toggle${renderState.activeSearchPreference === "prefer_search" ? " goal-input-search-toggle-active" : ""}"
              aria-pressed="${renderState.activeSearchPreference === "prefer_search"}"
              aria-label="${escapeHtml(renderState.messages.searchToggleLabel)}"
              title="${escapeHtml(renderState.activeSearchPreference === "prefer_search" ? renderState.messages.searchToggleHintPreferSearch : renderState.messages.searchToggleHintAuto)}"
              ${conversationActionsDisabled ? "disabled" : ""}
            >
              <span style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>
                <span>联网</span>
              </span>
            </button>
            ${renderLlmProfileSelector(renderState)}
          </div>
          ${actionButton}
        </div>
      </div>
      <div class="input-disclaimer">内容由 AI 生成，仅供参考，请注意甄别</div>
    </div>
  `;
}

export function buildTimelineMarkup(renderState: RenderState) {
  const stepRecordsByPlanStep = new Map<string, StepRecord[]>();
  const orphanRecords: StepRecord[] = [];

  for (const record of renderState.currentState.timeline) {
    if (!record.planStepId) {
      orphanRecords.push(record);
      continue;
    }

    const matchedPlanStep = renderState.currentState.plan.find((step) => step.stepId === record.planStepId);
    if (!matchedPlanStep) {
      orphanRecords.push(record);
      continue;
    }

    const existing = stepRecordsByPlanStep.get(record.planStepId) ?? [];
    existing.push(record);
    stepRecordsByPlanStep.set(record.planStepId, existing);
  }

  const planTimelineMarkup =
    renderState.currentState.plan.length > 0
      ? renderState.currentState.plan
          .map((step) => renderPlanStep(step, stepRecordsByPlanStep.get(step.stepId) ?? [], renderState))
          .join("")
      : renderState.currentState.timeline.length > 0
        ? renderState.currentState.timeline.map((step) => renderTimelineStep(step, renderState)).join("")
        : `<div class="muted">${escapeHtml(renderState.messages.timelineWaiting)}</div>`;

  const orphanMarkup =
    orphanRecords.length > 0
      ? `<div class="timeline-sublist">${orphanRecords.map((record) => renderTimelineStep(record, renderState)).join("")}</div>`
      : "";

  return `
    <div class="timeline">
      ${planTimelineMarkup}
      ${orphanMarkup}
    </div>
  `;
}
