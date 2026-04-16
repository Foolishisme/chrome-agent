import type { SearchPreference } from "../../shared/types";
import { classifyTaskType } from "../llm-client";
import { buildPlanSteps, detectTaskTypeWithLiteModel } from "../query-compiler";
import { toPublicState } from "./public-state";
import { getOrPrepareSessionTab } from "./tab-host";
import type { ActiveSession } from "./shared";
import { appendLog, createSessionId } from "./shared";

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
  const { tab, navigatedToHome, fromUrl } = await getOrPrepareSessionTab(taskType);

  const sessionId = createSessionId();
  const memory: ActiveSession["memory"] = {
    goal,
    taskType,
    searchPreference: options.searchPreference ?? "auto",
    conversationId: options.conversationId,
    conversationTitle: options.conversationTitle,
    currentTurnId: options.currentTurnId,
    conversationTurns,
    plan: buildPlanSteps(taskType),
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
      taskType === "direct_answer"
        ? "Ready to answer directly."
        : navigatedToHome && taskType === "commerce_search"
          ? "Detected a non-JD page and opened jd.com automatically."
          : navigatedToHome && taskType === "public_research"
            ? "Detected a non-scriptable page and opened Google automatically."
            : navigatedToHome && taskType === "site_overview"
              ? "Detected a non-scriptable page and opened Google automatically."
            : "Ready to start the session.",
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
    taskType,
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
