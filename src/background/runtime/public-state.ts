import type { ConversationTurn, SessionMemory, SessionPublicState } from "../../shared/agent-domain-model";
import { buildFallbackFinalResult } from "../tools/final-result-builders";

export function defaultPublicState(): SessionPublicState {
  return {
    status: "idle",
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
    memory.streamingFinalDraft = undefined;
    return;
  }

  memory.finalResult = buildFallbackFinalResult(memory, reason, status);
  memory.streamingFinalDraft = undefined;
}

export function toPublicState(memory: SessionMemory): SessionPublicState {
  return {
    sessionId: memory.runtimeMeta.sessionId,
    goal: memory.goal,
    llmProfile: memory.runtimeMeta.llmProfile,
    conversationId: memory.conversationId,
    conversationTitle: memory.conversationTitle,
    conversationTurns: buildConversationTurns(memory),
    searchPreference: memory.searchPreference,
    status: memory.runtimeMeta.status,
    error: memory.lastError,
    unresolvedIssues: memory.unresolvedIssues,
    streamingFinalDraft: memory.runtimeMeta.status === "running" ? memory.streamingFinalDraft : undefined,
    finalResult: memory.finalResult,
    updatedAt: Date.now(),
  };
}
