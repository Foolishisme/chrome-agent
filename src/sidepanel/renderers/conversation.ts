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
  return `
    <div class="timeline-item">
      <div class="timeline-head">
        <span>#${step.step} ${escapeHtml(step.stepSummary)}</span>
        <span>${new Date(step.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="timeline-body">
        <div><strong>${escapeHtml(renderState.messages.timelineAction)}:</strong> ${escapeHtml(step.action?.type ?? renderState.messages.emptyValue)}</div>
        <div><strong>${escapeHtml(renderState.messages.timelineResult)}:</strong> ${escapeHtml(step.actionResult?.message ?? renderState.messages.emptyValue)}</div>
        <div><strong>${escapeHtml(renderState.messages.timelineExpected)}:</strong> ${escapeHtml(step.expectedOutcome ?? renderState.messages.emptyValue)}</div>
        <div><strong>${escapeHtml(renderState.messages.timelineSnapshot)}:</strong> ${escapeHtml(step.snapshotSummary ?? renderState.messages.emptyValue)}</div>
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
  const customizedTitle = navigator.language.startsWith("zh")
    ? isRunning
      ? `思考中 ${compact}`
      : `已思考 ${compact}`
    : isRunning
      ? `Thinking ${compact}`
      : `Thought for ${compact}`;

  return `
    <details class="timeline-details"${open ? " open" : ""} style="margin-bottom: 12px;">
      <summary style="cursor: pointer; color: #7b6e62; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: list-item;">
        <span>${escapeHtml(customizedTitle)}</span>
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
      : `<button id="start-button" type="button" class="goal-input-action-button goal-input-start-button" title="${escapeHtml(renderState.messages.start)}">→</button>`;
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
                <span>${escapeHtml(conversation.title)}</span>
                <span class="conversation-meta">${escapeHtml(conversation.turnCount)}</span>
              </button>
            `,
          )
          .join("")
      : `<div class="muted">${escapeHtml(renderState.archiveUiText.conversationHistoryEmpty)}</div>`;

  return `
    <div class="controls">
      <div class="conversation-toolbar">
        <button id="toggle-conversations-button" type="button" class="button-secondary action-button">
          ${escapeHtml(renderState.archiveUiText.currentConversation)}: ${escapeHtml(currentConversationTitle)}
        </button>
        <button id="create-conversation-button" type="button" class="button-secondary action-button" ${conversationActionsDisabled ? "disabled" : ""}>
          ${escapeHtml(renderState.archiveUiText.newConversation)}
        </button>
      </div>
      ${
        renderState.showConversationDrawer
          ? `
            <div class="conversation-drawer">
              <div class="conversation-drawer-head">历史会话</div>
              <div class="conversation-drawer-list">${conversationHistory}</div>
              <div class="conversation-drawer-actions">
                ${
                  renderState.currentState.conversationId
                    ? `
                      <button
                        id="delete-conversation-button"
                        type="button"
                        class="button-secondary action-button"
                        ${conversationActionsDisabled ? "disabled" : ""}
                      >
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
          <div style="display: flex; gap: 8px; align-items: center;">
            <button
              id="search-preference-toggle"
              type="button"
              class="goal-input-search-toggle${renderState.activeSearchPreference === "prefer_search" ? " goal-input-search-toggle-active" : ""}"
              aria-pressed="${renderState.activeSearchPreference === "prefer_search"}"
              aria-label="${escapeHtml(renderState.messages.searchToggleLabel)}"
              title="${escapeHtml(renderState.activeSearchPreference === "prefer_search" ? renderState.messages.searchToggleHintPreferSearch : renderState.messages.searchToggleHintAuto)}"
              ${conversationActionsDisabled ? "disabled" : ""}
            >
              <span style="display: flex; align-items: center; gap: 4px; font-size: 13px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>
                <span>联网搜索</span>
              </span>
            </button>
            ${renderLlmProfileSelector(renderState)}
          </div>
          ${actionButton}
        </div>
      </div>
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
