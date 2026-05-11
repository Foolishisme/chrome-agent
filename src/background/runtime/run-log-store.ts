import type { DebugLogEntry, SessionDebugBundle, SessionMemory } from "../../shared/types";

const RUN_LOG_PREFIX = "sessionRunLog:v1:";
const MAX_PERSISTED_RUN_LOGS = 400;

interface StoredSessionRunLog extends SessionDebugBundle {
  updatedAt: number;
}

function getChromeLocalStorage() {
  return globalThis.chrome?.storage?.local;
}

function getRunLogStorageKey(sessionId: string) {
  return `${RUN_LOG_PREFIX}${sessionId}`;
}

function getRunLogEntryKey(entry: DebugLogEntry) {
  return [
    entry.timestamp,
    entry.source,
    entry.level,
    entry.message,
    entry.detail ?? "",
    entry.stepId ?? "",
    entry.toolName ?? "",
    entry.round ?? "",
  ].join("\u001f");
}

export function mergeSessionRunLogs(...batches: Array<DebugLogEntry[] | undefined>) {
  const seen = new Set<string>();
  const merged: DebugLogEntry[] = [];

  for (const batch of batches) {
    for (const entry of batch ?? []) {
      const key = getRunLogEntryKey(entry);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(entry);
    }
  }

  return merged.slice(-MAX_PERSISTED_RUN_LOGS);
}

function normalizeStoredRunLog(value: unknown): StoredSessionRunLog | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<StoredSessionRunLog>;
  if (typeof candidate.sessionId !== "string" || !Array.isArray(candidate.runLogs)) {
    return undefined;
  }

  return {
    sessionId: candidate.sessionId,
    goal: candidate.goal,
    taskType: candidate.taskType,
    taskSpec: candidate.taskSpec,
    finalResult: candidate.finalResult,
    runLogs: Array.isArray(candidate.runLogs) ? candidate.runLogs : [],
    filterDiagnostics: candidate.filterDiagnostics,
    unresolvedIssues: Array.isArray(candidate.unresolvedIssues) ? candidate.unresolvedIssues : [],
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
  };
}

async function saveStoredRunLog(record: StoredSessionRunLog) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return;
  }

  await storage.set({
    [getRunLogStorageKey(record.sessionId)]: record,
  });
}

export async function appendSessionRunLogEntry(sessionId: string, entry: DebugLogEntry) {
  const storage = getChromeLocalStorage();
  if (!sessionId || !storage) {
    return;
  }

  const storageKey = getRunLogStorageKey(sessionId);
  const stored = await storage.get(storageKey);
  const current = normalizeStoredRunLog(stored[storageKey]);
  const next: StoredSessionRunLog = {
    sessionId,
    goal: current?.goal,
    taskType: current?.taskType,
    taskSpec: current?.taskSpec,
    finalResult: current?.finalResult,
    runLogs: mergeSessionRunLogs(current?.runLogs, [entry]),
    filterDiagnostics: current?.filterDiagnostics,
    unresolvedIssues: current?.unresolvedIssues ?? [],
    updatedAt: Date.now(),
  };
  await saveStoredRunLog(next);
}

export async function saveSessionRunDebugSnapshot(memory: SessionMemory) {
  const sessionId = memory.runtimeMeta.sessionId;
  const storage = getChromeLocalStorage();
  if (!sessionId || !storage) {
    return;
  }

  const storageKey = getRunLogStorageKey(sessionId);
  const stored = await storage.get(storageKey);
  const current = normalizeStoredRunLog(stored[storageKey]);
  const next: StoredSessionRunLog = {
    sessionId,
    goal: memory.goal,
    taskType: memory.taskType,
    taskSpec: memory.taskSpec,
    finalResult: memory.finalResult,
    runLogs: mergeSessionRunLogs(current?.runLogs, memory.logs),
    filterDiagnostics: memory.filterDiagnostics,
    unresolvedIssues: [...memory.unresolvedIssues],
    updatedAt: Date.now(),
  };
  await saveStoredRunLog(next);
}

export async function loadSessionRunLog(sessionId: string) {
  const storage = getChromeLocalStorage();
  if (!sessionId || !storage) {
    return undefined;
  }

  const storageKey = getRunLogStorageKey(sessionId);
  const stored = await storage.get(storageKey);
  return normalizeStoredRunLog(stored[storageKey]);
}

export async function exportSessionDebugBundle(sessionId: string) {
  const stored = await loadSessionRunLog(sessionId);
  if (!stored) {
    return undefined;
  }

  const { updatedAt: _updatedAt, ...bundle } = stored;
  return bundle;
}

export async function deleteSessionRunLog(sessionId: string) {
  const storage = getChromeLocalStorage();
  if (!sessionId || !storage) {
    return;
  }
  await storage.remove(getRunLogStorageKey(sessionId));
}
