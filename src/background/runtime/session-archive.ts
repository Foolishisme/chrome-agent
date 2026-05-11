import type { SessionPublicState } from "../../shared/agent-domain-model";
import {
  buildSessionStateFromConversation,
  buildArchivedTurn,
  appendTurnToConversation,
  toConversationTurns,
} from "./session-archive-mappers";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getPreferredConversation,
  listConversationSummaries,
  replaceConversation,
  rollbackConversationToTurn,
  selectConversation,
} from "./session-archive-store";
import type { SaveSessionArchiveInput } from "./session-archive-types";

export { createConversation, getPreferredConversation, toConversationTurns };

export async function saveSessionArchive(input: SaveSessionArchiveInput) {
  if (!input.sessionId || !input.goal || !input.finalResult) {
    return undefined;
  }

  let archive = input.conversationId ? await getConversation(input.conversationId) : await getPreferredConversation();
  if (!archive) {
    archive = await createConversation(input.conversationTitle ?? input.goal);
  }

  const turn = buildArchivedTurn(input, archive.nextTurnId);
  const updatedArchive = appendTurnToConversation(archive, turn, input.goal);
  return replaceConversation(updatedArchive);
}

export const saveSuccessfulSessionArchive = saveSessionArchive;

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
