import type { ConversationTurn, FinalResult } from "../../shared/types";

export interface ArchivedTurn {
  turnId: number;
  sessionId: string;
  goal: string;
  answerSummary: string;
  answerMarkdown: string;
  finalResult: FinalResult;
  savedAt: number;
}

export interface ArchivedConversation {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  nextTurnId: number;
  turns: ArchivedTurn[];
}

export interface SaveSessionArchiveInput {
  sessionId: string;
  goal: string;
  finalResult: FinalResult;
  conversationId?: string;
  conversationTitle?: string;
}

export function toConversationTurn(turn: ArchivedTurn): ConversationTurn {
  return {
    turnId: turn.turnId,
    sessionId: turn.sessionId,
    goal: turn.goal,
    answerSummary: turn.answerSummary,
    answerMarkdown: turn.answerMarkdown,
    savedAt: turn.savedAt,
  };
}
