import type { SearchPreference } from "../../shared/agent-domain-model";
import { classifyTaskType } from "../llm/llm-client";
import { compileTaskSpec, detectTaskTypeWithLiteModel } from "../llm/query-compiler";
import { refineCommerceSearchQuery, refineResearchQuery } from "../llm/llm-client";
import { buildRuntimeTaskPlan } from "../runner/task-plan-builder";
import { toPublicState } from "./public-state";
import type { ActiveSession } from "./runtime-session-state";
import { appendLog, createSessionId } from "./runtime-session-state";
import { getOrPrepareSessionTab } from "./tab-host";

async function getSessionAnchorTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }
  return tab;
}

async function getSessionBootstrapTab(taskType: string) {
  if (taskType === "commerce_search") {
    return getOrPrepareSessionTab(taskType);
  }

  const tab = await getSessionAnchorTab();
  return {
    tab,
    navigatedToHome: false,
    fromUrl: tab.url ?? undefined,
  };
}

export async function createInitialSession(
  goal: string,
  options: {
    conversationId?: string;
    conversationTitle?: string;
    conversationTurns?: ActiveSession["memory"]["conversationTurns"];
    currentTurnId?: number;
    searchPreference?: SearchPreference;
    llmProfile?: ActiveSession["memory"]["runtimeMeta"]["llmProfile"];
    signal: AbortSignal;
  },
): Promise<{ session: ActiveSession; navigatedToHome: boolean; fromUrl?: string }> {
  const currentTimeIso = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const conversationTurns = options.conversationTurns ?? [];
  const conversationContext = conversationTurns
    .slice(-3)
    .map(
      (turn) =>
        `Turn ${turn.turnId} | savedAt: ${new Date(turn.savedAt).toISOString()}\nUser: ${turn.goal}\nAssistant final result: ${turn.answerSummary}`,
    )
    .join("\n\n");

  const route = await detectTaskTypeWithLiteModel(goal, {
    conversationTurns,
    searchPreference: options.searchPreference,
    classifyWithLiteModel: async (routeGoal) => {
      const classified = await classifyTaskType(routeGoal, {
        signal: options.signal,
        conversationContext,
        conversationTurns,
        currentTimeIso,
        timezone,
        searchPreference: options.searchPreference,
      });
      return {
        taskType: classified.taskType,
        reason: classified.reason,
        confidence: classified.confidence,
        decisionSignals: classified.decisionSignals,
      };
    },
  });

  const taskType = route.taskType;
  const { tab, navigatedToHome, fromUrl } = await getSessionBootstrapTab(taskType);
  const compiled = await compileTaskSpec(goal, {
    taskType,
    searchPreference: options.searchPreference,
    routeReason: route.reason,
    currentTimeIso,
    timezone,
    conversationTurns,
    classifyTaskTypeWithLiteModel: async (routeGoal) => {
      const classified = await classifyTaskType(routeGoal, {
        signal: options.signal,
        conversationContext,
        conversationTurns,
        currentTimeIso,
        timezone,
        searchPreference: options.searchPreference,
      });
      return {
        taskType: classified.taskType,
        reason: classified.reason,
        confidence: classified.confidence,
        decisionSignals: classified.decisionSignals,
      };
    },
    refineCommerceWithLiteModel: async (routeGoal) => {
      const refined = await refineCommerceSearchQuery(routeGoal, {
        signal: options.signal,
        conversationContext,
      });
      return {
        searchQuery: refined.searchQuery,
        reason: refined.reason,
      };
    },
    refineResearchWithLiteModel: async (routeGoal) => {
      const refined = await refineResearchQuery(routeGoal, {
        signal: options.signal,
        conversationContext,
      });
      return {
        searchQuery: refined.searchQuery,
        reason: refined.reason,
      };
    },
  });

  const sessionId = createSessionId();
  const memory: ActiveSession["memory"] = {
    goal,
    taskType: compiled.taskType,
    searchPreference: options.searchPreference ?? "auto",
    conversationId: options.conversationId,
    conversationTitle: options.conversationTitle,
    currentTurnId: options.currentTurnId,
    conversationTurns,
    plan: buildRuntimeTaskPlan(compiled.taskSpec),
    taskSpec: compiled.taskSpec,
    toolHistory: [],
    currentFacts: {
      routeReason: route.reason,
      routeConfidence: route.confidence,
      routeDecisionSignals: route.decisionSignals ?? [],
      routeSource: route.source,
      routeEvaluatedAt: currentTimeIso,
      routeTimezone: timezone,
    },
    stepHistory: [],
    logs: [],
    rawExtractedItems: [],
    extractedItems: [],
    researchCandidates: [],
    researchSources: [],
    unresolvedIssues: [],
    activeSourceIndex: 0,
    failures: [],
    liveStepSummary:
      compiled.taskType === "direct_answer"
        ? "Ready to answer directly."
        : "Ready to start the runtime tool session.",
    runtimeMeta: {
      sessionId,
      tabId: tab.id!,
      pageType: "unknown",
      status: "idle",
      llmProfile: options.llmProfile,
      currentStepId: undefined,
      currentTool: undefined,
      currentStep: 0,
      budgetLow: false,
      actionRetryCount: 0,
      recoveryCount: 0,
      pageWaitRecoveryCount: 0,
      dialogCloseRecoveryCount: 0,
      searchReopenRecoveryCount: 0,
      queryRefineTried: false,
      sameToolRetryCount: 0,
      sameToolRetryTool: undefined,
      consecutiveNoProgressCount: 0,
      currentRound: 1,
      maxRounds: 2,
      startedAt: Date.now(),
    },
  };
  memory.runtimeMeta.currentStepId = memory.plan[0]?.stepId;

  const session: ActiveSession = {
    memory,
    stopped: false,
    abortController: new AbortController(),
    lastPublicState: toPublicState(memory),
  };

  appendLog(session, "runtime", "info", "Session started.", {
    goal,
    taskType: compiled.taskType,
    routeSource: route.source,
    routeReason: route.reason,
    routeConfidence: route.confidence,
    routeDecisionSignals: route.decisionSignals ?? [],
    tabId: tab.id,
    currentUrl: tab.url,
  });

  if (navigatedToHome) {
    appendLog(session, "runtime", "warn", "Automatically redirected the active tab before session start.", {
      fromUrl,
      toUrl: tab.url,
      taskType,
    });
  }

  return {
    session,
    navigatedToHome,
    fromUrl,
  };
}
