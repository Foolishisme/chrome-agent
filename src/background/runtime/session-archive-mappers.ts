import type { ConversationSummary, SessionPublicState } from "../../shared/types";
import type { ArchivedConversation, ArchivedTurn, SaveSessionArchiveInput } from "./session-archive-types";
import { buildConversationTitle } from "./session-archive-store";
import { toConversationTurn } from "./session-archive-types";

function getAnswerMarkdownFromFinalResult(finalResult: SaveSessionArchiveInput["finalResult"]) {
  return finalResult.markdown || finalResult.artifacts.find((artifact) => artifact.kind === "markdown")?.content || finalResult.summary;
}

export function buildArchivedTurn(input: SaveSessionArchiveInput, turnId: number): ArchivedTurn {
  const savedAt = Date.now();
  return {
    turnId,
    sessionId: input.sessionId,
    goal: input.goal,
    answerSummary: input.finalResult.summary,
    answerMarkdown: getAnswerMarkdownFromFinalResult(input.finalResult),
    finalResult: input.finalResult,
    savedAt,
  };
}

export function appendTurnToConversation(
  archive: ArchivedConversation,
  turn: ArchivedTurn,
  goalForInitialTitle?: string,
): ArchivedConversation {
  return {
    ...archive,
    title: archive.turns.length === 0 ? buildConversationTitle(goalForInitialTitle) : archive.title,
    updatedAt: turn.savedAt,
    nextTurnId: turn.turnId + 1,
    turns: [...archive.turns, turn],
  };
}

export function toConversationTurns(archive: ArchivedConversation | undefined) {
  return archive?.turns.map((turn) => toConversationTurn(turn)) ?? [];
}

export function buildSessionStateFromConversation(
  archive: ArchivedConversation | undefined,
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
    ...fallbackState,
    sessionId: latestTurn.sessionId,
    goal: latestTurn.goal,
    conversationId: archive.conversationId,
    conversationTitle: archive.title,
    conversationTurns: toConversationTurns(archive),
    availableConversations: summaries,
    status: "done",
    finalResult: latestTurn.finalResult,
    error: undefined,
    updatedAt: latestTurn.savedAt,
  };
}
