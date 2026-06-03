import type { SearchPreference } from "../../shared/agent-domain-model";
import { classifyTaskType, planTaskWithLiteModel, streamTaskPlanOrDirectAnswer } from "../llm/llm-client";
import { compileTaskSpec, detectTaskTypeWithLiteModel, type LiteTaskPlan } from "../llm/query-compiler";
import { refineCommerceSearchQuery, refineResearchQuery } from "../llm/llm-client";
import { buildRuntimeTaskPlan } from "../runner/task-plan-builder";
import { toPublicState } from "./public-state";
import type { ActiveSession } from "./runtime-session-state";
import { appendLog, createSessionId } from "./runtime-session-state";
import { getOrPrepareSessionTab } from "./tab-host";
import { createFinalResult, deriveKeyResultsFromMarkdown, deriveSummaryFromMarkdown } from "../tools/final-result-builders";

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
    publishBootstrapState?: (session: ActiveSession) => Promise<void>;
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

  const anchorTab = await getSessionAnchorTab();
  const sessionId = createSessionId();
  const provisionalTaskSpec = {
    taskType: "direct_answer" as const,
    originalGoal: goal,
    outputMode: "inline" as const,
    routeReason: "Lite routing is running.",
    currentTimeIso,
    timezone,
    evidenceTurnCount: conversationTurns.slice(-3).length,
  };
  const memory: ActiveSession["memory"] = {
    goal,
    taskType: "direct_answer",
    searchPreference: options.searchPreference ?? "auto",
    conversationId: options.conversationId,
    conversationTitle: options.conversationTitle,
    currentTurnId: options.currentTurnId,
    conversationTurns,
    plan: [],
    taskSpec: provisionalTaskSpec,
    toolHistory: [],
    currentFacts: {
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
    liveStepSummary: "Planning the request.",
    runtimeMeta: {
      sessionId,
      tabId: anchorTab.id!,
      pageType: "unknown",
      status: "running",
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
  const session: ActiveSession = {
    memory,
    stopped: false,
    abortController: new AbortController(),
    lastPublicState: toPublicState(memory),
  };
  await options.publishBootstrapState?.(session);

  let route: LiteTaskPlan;
  try {
    const routed = await streamTaskPlanOrDirectAnswer(goal, {
      signal: options.signal,
      conversationContext,
      conversationTurns,
      currentTimeIso,
      timezone,
      searchPreference: options.searchPreference,
      onDirectAnswerDelta: async (delta) => {
        const previous = memory.streamingFinalDraft?.markdown ?? "";
        memory.streamingFinalDraft = {
          markdown: `${previous}${delta}`,
          updatedAt: Date.now(),
        };
        memory.liveStepSummary = "Streaming the direct answer.";
        await options.publishBootstrapState?.(session);
      },
    });

    if (routed.kind === "direct_answer") {
      memory.taskType = "direct_answer";
      memory.taskSpec = {
        ...provisionalTaskSpec,
        routeReason: "Lite router answered directly.",
      };
      memory.currentFacts = {
        ...memory.currentFacts,
        routeReason: "Lite router answered directly.",
        routeSource: "llm-lite",
        routeDecisionSignals: ["direct_answer_streamed"],
      };
      const summary = deriveSummaryFromMarkdown(routed.markdown, `已直接回答“${goal}”。`);
      memory.finalResult = createFinalResult(memory, {
        status: "success",
        summary,
        markdown: routed.markdown,
        keyResults: deriveKeyResultsFromMarkdown(routed.markdown),
        suggestedNextAction: "继续追问即可；如需最新外部信息，请明确要求联网搜索。",
      });
      memory.streamingFinalDraft = undefined;
      memory.runtimeMeta.status = "done";
      memory.liveStepSummary = "Final result is ready.";
      appendLog(session, "llm", "info", "Lite router streamed a direct answer.", {
        model: routed.model,
        provider: routed.provider,
      });
      await options.publishBootstrapState?.(session);
      return {
        session,
        navigatedToHome: false,
        fromUrl: anchorTab.url ?? undefined,
      };
    }

    route = {
      taskType: routed.taskType,
      reason: routed.reason,
      confidence: routed.confidence,
      decisionSignals: routed.decisionSignals,
      searchQuery: routed.searchQuery,
      officialSearchQuery: routed.officialSearchQuery,
      entryUrl: routed.entryUrl,
      source: "llm-lite",
    };
  } catch (_error) {
    try {
      const planned = await planTaskWithLiteModel(goal, {
        signal: options.signal,
        conversationContext,
        conversationTurns,
        currentTimeIso,
        timezone,
        searchPreference: options.searchPreference,
      });
      route = {
        taskType: planned.taskType,
        reason: planned.reason,
        confidence: planned.confidence,
        decisionSignals: planned.decisionSignals,
        searchQuery: planned.searchQuery,
        officialSearchQuery: planned.officialSearchQuery,
        entryUrl: planned.entryUrl,
        source: "llm-lite",
      };
    } catch (error) {
      const fallbackRoute = await detectTaskTypeWithLiteModel(goal, {
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
      route = {
        ...fallbackRoute,
        reason: `planner unavailable, ${fallbackRoute.reason}: ${error instanceof Error ? error.message : "unknown planner error"}`,
      };
    }
  }

  const taskType = route.taskType;
  const { tab, navigatedToHome, fromUrl } =
    taskType === "commerce_search"
      ? await getSessionBootstrapTab(taskType)
      : { tab: anchorTab, navigatedToHome: false, fromUrl: anchorTab.url ?? undefined };
  const compiled = await compileTaskSpec(goal, {
    taskType,
    plannedTask: route,
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
        currentTimeIso,
        timezone,
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
        currentTimeIso,
        timezone,
      });
      return {
        searchQuery: refined.searchQuery,
        reason: refined.reason,
      };
    },
  });

  memory.taskType = compiled.taskType;
  memory.plan = buildRuntimeTaskPlan(compiled.taskSpec);
  memory.taskSpec = compiled.taskSpec;
  memory.currentFacts = {
    ...memory.currentFacts,
    routeReason: route.reason,
    routeConfidence: route.confidence,
    routeDecisionSignals: route.decisionSignals ?? [],
    routeSource: route.source,
  };
  memory.liveStepSummary = "Ready to start the runtime tool session.";
  memory.runtimeMeta.tabId = tab.id!;
  memory.runtimeMeta.status = "idle";
  memory.runtimeMeta.currentStepId = memory.plan[0]?.stepId;
  session.lastPublicState = toPublicState(memory);

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
