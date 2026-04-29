import { RuntimeError } from "../../shared/errors";
import type { DebugLogEntry, DebugLogLevel, SessionMemory, SessionPublicState, ToolName, ToolResult } from "../../shared/types";
import { appendSessionRunLogEntry } from "./run-log-store";

export const MAX_LOG_ENTRIES = 80;
export const MAX_FAILURE_ENTRIES = 12;
export const MAX_TOOL_HISTORY_ENTRIES = 20;
export const MAX_SAME_TOOL_RETRIES = 3;
export const MAX_CONSECUTIVE_NO_PROGRESS = 3;

export interface ActiveSession {
  memory: SessionMemory;
  stopped: boolean;
  abortController: AbortController;
  lastPublicState: SessionPublicState;
}

export interface ProgressSnapshot {
  currentFactsJson: string;
  itemCount: number;
  candidateCount: number;
  sourceCount: number;
  completedStepCount: number;
  hasFinalResult: boolean;
}

export function createSessionId() {
  return crypto.randomUUID();
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDetail(detail: unknown): string | undefined {
  if (detail === undefined) {
    return undefined;
  }

  if (typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export function throwIfStopped(session: ActiveSession) {
  if (session.stopped || session.abortController.signal.aborted) {
    throw new RuntimeError("The session was stopped.", "SESSION_STOPPED");
  }
}

export function appendLog(
  session: ActiveSession,
  source: DebugLogEntry["source"],
  level: DebugLogLevel,
  message: string,
  detail?: unknown,
) {
  const entry: DebugLogEntry = {
    timestamp: Date.now(),
    source,
    level,
    message,
    detail: formatDetail(detail),
    stepId: session.memory.runtimeMeta.currentStepId,
    toolName: session.memory.runtimeMeta.currentTool,
    round: session.memory.runtimeMeta.currentRound,
  };
  session.memory.logs = [...session.memory.logs, entry].slice(-MAX_LOG_ENTRIES);
  void appendSessionRunLogEntry(session.memory.runtimeMeta.sessionId, entry);
}

export function captureProgressSnapshot(memory: SessionMemory): ProgressSnapshot {
  return {
    currentFactsJson: JSON.stringify(memory.currentFacts),
    itemCount: memory.extractedItems.length,
    candidateCount: memory.researchCandidates.length,
    sourceCount: memory.researchSources.length,
    completedStepCount: memory.plan.filter((step) => step.status === "succeeded").length,
    hasFinalResult: !!memory.finalResult,
  };
}

export function detectProgress(memory: SessionMemory, before: ProgressSnapshot, result: ToolResult) {
  if (Object.keys(result.facts).length > 0 || result.artifacts.length > 0) {
    return true;
  }

  return (
    JSON.stringify(memory.currentFacts) !== before.currentFactsJson ||
    memory.extractedItems.length > before.itemCount ||
    memory.researchCandidates.length > before.candidateCount ||
    memory.researchSources.length > before.sourceCount ||
    memory.plan.filter((step) => step.status === "succeeded").length > before.completedStepCount ||
    (!!memory.finalResult && !before.hasFinalResult)
  );
}

export function markToolFailure(
  session: ActiveSession,
  toolName: ToolName,
  message: string,
  errorCode?: string,
  stepStatus: "failed" | "blocked" = "failed",
) {
  session.memory.toolHistory = [
    ...session.memory.toolHistory,
    {
      toolName,
      status: "fatal_error" as const,
      summary: message,
      stepStatus,
      timestamp: Date.now(),
    },
  ].slice(-MAX_TOOL_HISTORY_ENTRIES);
  session.memory.failures = [
    ...session.memory.failures,
    {
      toolName,
      message,
      errorCode,
      timestamp: Date.now(),
    },
  ].slice(-MAX_FAILURE_ENTRIES);
}
