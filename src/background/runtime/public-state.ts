import type { ConversationTurn, SessionMemory, SessionPublicState } from "../../shared/types";
import { buildFallbackFinalResult } from "../tools/result-builders";

const TIMELINE_LIMIT = 8;

function getElapsedMs(memory: SessionMemory, now = Date.now()) {
  return Math.max(0, now - memory.runtimeMeta.startedAt);
}

export function defaultPublicState(): SessionPublicState {
  return {
    status: "idle",
    currentStep: 0,
    plan: [],
    items: [],
    logs: [],
    timeline: [],
    updatedAt: Date.now(),
  };
}

function buildCurrentConversationTurn(memory: SessionMemory): ConversationTurn | undefined {
  if (!memory.finalResult || !memory.runtimeMeta.sessionId || memory.currentTurnId === undefined) {
    return undefined;
  }

  const answerMarkdown =
    memory.finalResult.markdown ||
    memory.finalResult.artifacts.find((artifact) => artifact.kind === "markdown")?.content ||
    memory.finalResult.summary;

  return {
    turnId: memory.currentTurnId,
    sessionId: memory.runtimeMeta.sessionId,
    goal: memory.goal,
    answerSummary: memory.finalResult.summary,
    answerMarkdown,
    timeline: memory.stepHistory.slice(),
    savedAt: Date.now(),
  };
}

function buildConversationTurns(memory: SessionMemory) {
  const currentTurn = buildCurrentConversationTurn(memory);
  if (!currentTurn) {
    return memory.conversationTurns;
  }

  if (memory.conversationTurns.some((turn) => turn.turnId === currentTurn.turnId)) {
    return memory.conversationTurns;
  }

  return [...memory.conversationTurns, currentTurn];
}

export function ensureTerminalResult(memory: SessionMemory, reason: string, status?: "partial" | "failed" | "blocked") {
  if (memory.finalResult) {
    return;
  }

  memory.finalResult = buildFallbackFinalResult(memory, reason, status);
}

export function toPublicState(memory: SessionMemory): SessionPublicState {
  const lastStep = memory.stepHistory.at(-1);
  return {
    sessionId: memory.runtimeMeta.sessionId,
    goal: memory.goal,
    conversationId: memory.conversationId,
    conversationTitle: memory.conversationTitle,
    conversationTurns: buildConversationTurns(memory),
    searchPreference: memory.searchPreference,
    taskType: memory.taskType,
    taskSpec: memory.taskSpec,
    status: memory.runtimeMeta.status,
    currentStepId: memory.runtimeMeta.currentStepId,
    currentTool: memory.runtimeMeta.currentTool,
    currentStep: memory.runtimeMeta.currentStep,
    budgetLow: memory.runtimeMeta.budgetLow,
    elapsedMs: getElapsedMs(memory),
    plan: memory.plan,
    stepSummary: memory.liveStepSummary ?? lastStep?.stepSummary,
    lastAction: lastStep?.action,
    lastActionResult: lastStep?.actionResult,
    items: memory.extractedItems,
    rawItemCount: memory.rawExtractedItems.length,
    researchCandidates: memory.researchCandidates,
    researchSources: memory.researchSources,
    filterDiagnostics: memory.filterDiagnostics,
    logs: memory.logs,
    timeline: memory.stepHistory.slice(-TIMELINE_LIMIT),
    pageSnapshot: memory.pageSnapshot,
    recoveryHint: memory.recoveryHint,
    error: memory.lastError,
    unresolvedIssues: memory.unresolvedIssues,
    finalResult: memory.finalResult,
    updatedAt: Date.now(),
  };
}
