import { RuntimeError } from "../../shared/runtime-error";
import type { DebugLogEntry, DebugLogLevel, SessionMemory, SessionPublicState } from "../../shared/agent-domain-model";
import { appendSessionRunLogEntry } from "./run-log-store";

const MAX_LOG_ENTRIES = 80;

export interface ActiveSession {
  memory: SessionMemory;
  stopped: boolean;
  abortController: AbortController;
  lastPublicState: SessionPublicState;
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
