import type { ConversationSummary, ConversationTurn, SessionPublicState } from "../shared/types";

const CONVERSATION_INDEX_KEY = "conversationArchiveIndexV1";
const ACTIVE_CONVERSATION_KEY = "activeConversationIdV1";
const CONVERSATION_PREFIX = "conversationArchive:";

interface StoredConversationTurn extends ConversationTurn {
  state: SessionPublicState;
}

interface StoredConversationArchive {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  nextTurnId: number;
  turns: StoredConversationTurn[];
}

function getConversationStorageKey(conversationId: string) {
  return `${CONVERSATION_PREFIX}${conversationId}`;
}

function buildConversationTitle(goal?: string) {
  const normalized = (goal ?? "").trim();
  if (!normalized) {
    return "新会话";
  }

  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

function getAnswerMarkdown(state: SessionPublicState) {
  return (
    state.finalResult?.markdown ||
    state.finalResult?.artifacts.find((artifact) => artifact.kind === "markdown")?.content ||
    state.finalResult?.summary ||
    ""
  );
}

function toConversationSummary(archive: StoredConversationArchive): ConversationSummary {
  return {
    conversationId: archive.conversationId,
    title: archive.title,
    turnCount: archive.turns.length,
    updatedAt: archive.updatedAt,
  };
}

function normalizeConversation(value: unknown): StoredConversationArchive | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<StoredConversationArchive>;
  if (!candidate.conversationId || !candidate.title || !Array.isArray(candidate.turns)) {
    return undefined;
  }

  return {
    conversationId: candidate.conversationId,
    title: candidate.title,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
    nextTurnId: typeof candidate.nextTurnId === "number" ? candidate.nextTurnId : candidate.turns.length + 1,
    turns: candidate.turns.filter((turn): turn is StoredConversationTurn => {
      return !!turn && typeof turn === "object" && "turnId" in turn && "state" in turn;
    }),
  };
}

async function getConversationIndex() {
  const stored = await chrome.storage.local.get(CONVERSATION_INDEX_KEY);
  return Array.isArray(stored[CONVERSATION_INDEX_KEY])
    ? (stored[CONVERSATION_INDEX_KEY] as string[]).filter((item) => typeof item === "string" && item.length > 0)
    : [];
}

async function setConversationIndex(ids: string[]) {
  await chrome.storage.local.set({
    [CONVERSATION_INDEX_KEY]: ids,
  });
}

async function getActiveConversationId() {
  const stored = await chrome.storage.local.get(ACTIVE_CONVERSATION_KEY);
  return typeof stored[ACTIVE_CONVERSATION_KEY] === "string" ? (stored[ACTIVE_CONVERSATION_KEY] as string) : undefined;
}

async function setActiveConversationId(conversationId: string | undefined) {
  if (!conversationId) {
    await chrome.storage.local.remove(ACTIVE_CONVERSATION_KEY);
    return;
  }

  await chrome.storage.local.set({
    [ACTIVE_CONVERSATION_KEY]: conversationId,
  });
}

async function saveConversation(archive: StoredConversationArchive) {
  await chrome.storage.local.set({
    [getConversationStorageKey(archive.conversationId)]: archive,
  });
}

export async function getConversation(conversationId: string) {
  const stored = await chrome.storage.local.get(getConversationStorageKey(conversationId));
  return normalizeConversation(stored[getConversationStorageKey(conversationId)]);
}

export async function listConversationSummaries() {
  const ids = await getConversationIndex();
  const stored = await chrome.storage.local.get(ids.map((id) => getConversationStorageKey(id)));

  return ids
    .map((id) => normalizeConversation(stored[getConversationStorageKey(id)]))
    .filter((item): item is StoredConversationArchive => !!item)
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
  const now = Date.now();
  const archive: StoredConversationArchive = {
    conversationId: crypto.randomUUID(),
    title: buildConversationTitle(goal),
    createdAt: now,
    updatedAt: now,
    nextTurnId: 1,
    turns: [],
  };

  const currentIndex = await getConversationIndex();
  const nextIndex = [archive.conversationId, ...currentIndex.filter((item) => item !== archive.conversationId)];

  await chrome.storage.local.set({
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

export async function saveSuccessfulSessionArchive(
  state: SessionPublicState,
  options: {
    conversationId?: string;
    conversationTitle?: string;
    timeline?: SessionPublicState["timeline"];
  } = {},
) {
  if (!state.sessionId || !state.goal || !state.finalResult || state.finalResult.status !== "success") {
    return undefined;
  }

  let archive = options.conversationId ? await getConversation(options.conversationId) : await getPreferredConversation();
  if (!archive) {
    archive = await createConversation(options.conversationTitle ?? state.goal);
  }

  const turnId = archive.nextTurnId;
  const turn: StoredConversationTurn = {
    turnId,
    sessionId: state.sessionId,
    goal: state.goal,
    answerSummary: state.finalResult.summary,
    answerMarkdown: getAnswerMarkdown(state),
    timeline: [...(options.timeline ?? state.timeline ?? [])],
    savedAt: Date.now(),
    state: {
      ...state,
      conversationId: archive.conversationId,
      conversationTitle: archive.title,
    },
  };

  const updatedArchive: StoredConversationArchive = {
    ...archive,
    title: archive.turns.length === 0 ? buildConversationTitle(state.goal) : archive.title,
    updatedAt: turn.savedAt,
    nextTurnId: turnId + 1,
    turns: [...archive.turns, turn],
  };

  const currentIndex = await getConversationIndex();
  const nextIndex = [updatedArchive.conversationId, ...currentIndex.filter((item) => item !== updatedArchive.conversationId)];

  await chrome.storage.local.set({
    [getConversationStorageKey(updatedArchive.conversationId)]: updatedArchive,
    [CONVERSATION_INDEX_KEY]: nextIndex,
    [ACTIVE_CONVERSATION_KEY]: updatedArchive.conversationId,
  });

  return updatedArchive;
}

export async function rollbackConversationToTurn(conversationId: string, turnId: number) {
  const archive = await getConversation(conversationId);
  if (!archive) {
    return undefined;
  }

  const nextTurns = archive.turns.filter((turn) => turn.turnId <= turnId);
  const updatedArchive: StoredConversationArchive = {
    ...archive,
    updatedAt: Date.now(),
    turns: nextTurns,
  };

  await saveConversation(updatedArchive);
  await setActiveConversationId(updatedArchive.conversationId);
  return updatedArchive;
}

export async function deleteConversation(conversationId: string) {
  const currentIndex = await getConversationIndex();
  const nextIndex = currentIndex.filter((item) => item !== conversationId);
  await chrome.storage.local.remove(getConversationStorageKey(conversationId));
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

export function toConversationTurns(archive: StoredConversationArchive | undefined): ConversationTurn[] {
  return (
    archive?.turns.map(({ state: _state, timeline, ...turn }) => ({
      ...turn,
      timeline: timeline ?? [],
    })) ?? []
  );
}

export function buildSessionStateFromConversation(
  archive: StoredConversationArchive | undefined,
  summaries: ConversationSummary[],
  fallbackState: SessionPublicState,
): SessionPublicState {
  if (!archive || archive.turns.length === 0) {
    return {
      ...fallbackState,
      conversationId: archive?.conversationId,
      conversationTitle: archive?.title,
      conversationTurns: toConversationTurns(archive),
      availableConversations: summaries,
    };
  }

  const latestTurn = archive.turns[archive.turns.length - 1]!;
  return {
    ...latestTurn.state,
    conversationId: archive.conversationId,
    conversationTitle: archive.title,
    conversationTurns: toConversationTurns(archive),
    availableConversations: summaries,
  };
}

export async function loadConversationBackfillState(fallbackState: SessionPublicState) {
  const [archive, summaries] = await Promise.all([getPreferredConversation(), listConversationSummaries()]);
  return buildSessionStateFromConversation(archive, summaries, fallbackState);
}

export async function loadConversationState(conversationId: string, fallbackState: SessionPublicState) {
  const archive = await selectConversation(conversationId);
  const summaries = await listConversationSummaries();
  return buildSessionStateFromConversation(archive, summaries, fallbackState);
}

export async function createConversationState(fallbackState: SessionPublicState) {
  const archive = await createConversation("新会话");
  const summaries = await listConversationSummaries();
  return buildSessionStateFromConversation(archive, summaries, fallbackState);
}

export async function rollbackConversationState(conversationId: string, turnId: number, fallbackState: SessionPublicState) {
  const archive = await rollbackConversationToTurn(conversationId, turnId);
  const summaries = await listConversationSummaries();
  return buildSessionStateFromConversation(archive, summaries, fallbackState);
}

export async function deleteConversationState(conversationId: string, fallbackState: SessionPublicState) {
  const archive = await deleteConversation(conversationId);
  const summaries = await listConversationSummaries();
  return buildSessionStateFromConversation(archive, summaries, fallbackState);
}
