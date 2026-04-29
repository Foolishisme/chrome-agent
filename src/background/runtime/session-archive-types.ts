import type { ConversationTurn, FinalResult, StepRecord } from "../../shared/types";

export interface ArchivedTurn {
  turnId: number;
  sessionId: string;
  goal: string;
  answerSummary: string;
  answerMarkdown: string;
  finalResult: FinalResult;
  timeline: StepRecord[];
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
  timeline: StepRecord[];
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
    timeline: turn.timeline ?? [],
    savedAt: turn.savedAt,
  };
}
