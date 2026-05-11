import type { ConversationSummary } from "../../shared/types";
import type { ArchivedConversation } from "./session-archive-types";

const CONVERSATION_INDEX_KEY = "conversationArchiveIndexV2";
const ACTIVE_CONVERSATION_KEY = "activeConversationIdV2";
const CONVERSATION_PREFIX = "conversationArchive:v2:";

function getChromeLocalStorage() {
  return globalThis.chrome?.storage?.local;
}

export function buildConversationTitle(goal?: string) {
  const normalized = (goal ?? "").trim();
  if (!normalized) {
    return "新会话";
  }

  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

function getConversationStorageKey(conversationId: string) {
  return `${CONVERSATION_PREFIX}${conversationId}`;
}

function toConversationSummary(archive: ArchivedConversation): ConversationSummary {
  return {
    conversationId: archive.conversationId,
    title: archive.title,
    turnCount: archive.turns.length,
    updatedAt: archive.updatedAt,
  };
}

function normalizeTurn(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<ArchivedConversation["turns"][number]>;
  if (
    typeof candidate.turnId !== "number" ||
    typeof candidate.sessionId !== "string" ||
    typeof candidate.goal !== "string" ||
    typeof candidate.answerSummary !== "string" ||
    typeof candidate.answerMarkdown !== "string" ||
    !candidate.finalResult ||
    typeof candidate.savedAt !== "number"
  ) {
    return undefined;
  }

  return {
    turnId: candidate.turnId,
    sessionId: candidate.sessionId,
    goal: candidate.goal,
    answerSummary: candidate.answerSummary,
    answerMarkdown: candidate.answerMarkdown,
    finalResult: candidate.finalResult,
    savedAt: candidate.savedAt,
  };
}

function normalizeConversation(value: unknown): ArchivedConversation | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<ArchivedConversation>;
  if (!candidate.conversationId || !candidate.title || !Array.isArray(candidate.turns)) {
    return undefined;
  }

  const turns = candidate.turns
    .map((turn) => normalizeTurn(turn))
    .filter((turn): turn is ArchivedConversation["turns"][number] => !!turn);

  return {
    conversationId: candidate.conversationId,
    title: candidate.title,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
    nextTurnId: typeof candidate.nextTurnId === "number" ? candidate.nextTurnId : turns.length + 1,
    turns,
  };
}

async function getConversationIndex() {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return [];
  }

  const stored = await storage.get(CONVERSATION_INDEX_KEY);
  return Array.isArray(stored[CONVERSATION_INDEX_KEY])
    ? (stored[CONVERSATION_INDEX_KEY] as string[]).filter((item) => typeof item === "string" && item.length > 0)
    : [];
}

async function setConversationIndex(ids: string[]) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return;
  }

  await storage.set({
    [CONVERSATION_INDEX_KEY]: ids,
  });
}

async function getActiveConversationId() {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return undefined;
  }

  const stored = await storage.get(ACTIVE_CONVERSATION_KEY);
  return typeof stored[ACTIVE_CONVERSATION_KEY] === "string" ? (stored[ACTIVE_CONVERSATION_KEY] as string) : undefined;
}

async function setActiveConversationId(conversationId: string | undefined) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return;
  }

  if (!conversationId) {
    await storage.remove(ACTIVE_CONVERSATION_KEY);
    return;
  }

  await storage.set({
    [ACTIVE_CONVERSATION_KEY]: conversationId,
  });
}

export async function saveConversation(archive: ArchivedConversation) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return;
  }

  await storage.set({
    [getConversationStorageKey(archive.conversationId)]: archive,
  });
}

export async function getConversation(conversationId: string) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return undefined;
  }

  const stored = await storage.get(getConversationStorageKey(conversationId));
  return normalizeConversation(stored[getConversationStorageKey(conversationId)]);
}

export async function listConversationSummaries() {
  const ids = await getConversationIndex();
  const storage = getChromeLocalStorage();
  if (!storage) {
    return [];
  }

  const stored = await storage.get(ids.map((id) => getConversationStorageKey(id)));

  return ids
    .map((id) => normalizeConversation(stored[getConversationStorageKey(id)]))
    .filter((item): item is ArchivedConversation => !!item)
    .map(toConversationSummary);
}

export async function getPreferredConversation() {
  const activeConversationId = await getActiveConversationId();
  if (activeConversationId) {
    const activeConversation = await getConversation(activeConversationId);
    if (activeConversation) {
      return activeConversation;
    }
  }

  const ids = await getConversationIndex();
  const latestConversationId = ids[0];
  if (!latestConversationId) {
    return undefined;
  }

  const latestConversation = await getConversation(latestConversationId);
  if (latestConversation) {
    await setActiveConversationId(latestConversation.conversationId);
  }
  return latestConversation;
}

export async function createConversation(goal?: string) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    const now = Date.now();
    return {
      conversationId: crypto.randomUUID(),
      title: buildConversationTitle(goal),
      createdAt: now,
      updatedAt: now,
      nextTurnId: 1,
      turns: [],
    };
  }

  const now = Date.now();
  const archive: ArchivedConversation = {
    conversationId: crypto.randomUUID(),
    title: buildConversationTitle(goal),
    createdAt: now,
    updatedAt: now,
    nextTurnId: 1,
    turns: [],
  };

  const currentIndex = await getConversationIndex();
  const nextIndex = [archive.conversationId, ...currentIndex.filter((item) => item !== archive.conversationId)];

  await storage.set({
    [getConversationStorageKey(archive.conversationId)]: archive,
    [CONVERSATION_INDEX_KEY]: nextIndex,
    [ACTIVE_CONVERSATION_KEY]: archive.conversationId,
  });

  return archive;
}

export async function selectConversation(conversationId: string) {
  const archive = await getConversation(conversationId);
  if (!archive) {
    return undefined;
  }

  await setActiveConversationId(conversationId);
  return archive;
}

export async function replaceConversation(archive: ArchivedConversation) {
  await saveConversation(archive);

  const currentIndex = await getConversationIndex();
  const nextIndex = [archive.conversationId, ...currentIndex.filter((item) => item !== archive.conversationId)];
  const storage = getChromeLocalStorage();
  if (!storage) {
    return archive;
  }

  await storage.set({
    [CONVERSATION_INDEX_KEY]: nextIndex,
    [ACTIVE_CONVERSATION_KEY]: archive.conversationId,
  });

  return archive;
}

export async function rollbackConversationToTurn(conversationId: string, turnId: number) {
  const archive = await getConversation(conversationId);
  if (!archive) {
    return undefined;
  }

  const nextTurns = archive.turns.filter((turn) => turn.turnId <= turnId);
  const updatedArchive: ArchivedConversation = {
    ...archive,
    updatedAt: Date.now(),
    turns: nextTurns,
  };

  await saveConversation(updatedArchive);
  await setActiveConversationId(updatedArchive.conversationId);
  return updatedArchive;
}

export async function deleteConversation(conversationId: string) {
  const storage = getChromeLocalStorage();
  if (!storage) {
    return undefined;
  }

  const currentIndex = await getConversationIndex();
  const nextIndex = currentIndex.filter((item) => item !== conversationId);
  await storage.remove(getConversationStorageKey(conversationId));
  await setConversationIndex(nextIndex);

  const activeConversationId = await getActiveConversationId();
  if (activeConversationId === conversationId) {
    const nextActiveConversationId = nextIndex[0];
    await setActiveConversationId(nextActiveConversationId);
    if (nextActiveConversationId) {
      return getConversation(nextActiveConversationId);
    }
    return undefined;
  }

  return getPreferredConversation();
}
