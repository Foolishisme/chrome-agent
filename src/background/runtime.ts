import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type { ExecuteActionResponse, RequestSnapshotMessage, SnapshotResponse, StartSessionResponse } from "../shared/protocol";
import { toolResultSchema } from "../shared/schema";
import type {
  AgentAction,
  DebugLogEntry,
  DebugLogLevel,
  PlanStep,
  PlanStepStatus,
  SessionMemory,
  SessionPublicState,
  SnapshotData,
  StepRecord,
  TaskType,
  ToolName,
  ToolResult,
} from "../shared/types";
import { summarizeSnapshot } from "./guards";
import { chooseNextTool, classifyTaskType } from "./llm-client";
import { buildPlanSteps, buildTaskPlan, detectTaskTypeWithLiteModel } from "./query-compiler";
import { getToolDefinition, type ToolExecutionResult } from "./tools";

const JD_HOME_URL = "https://www.jd.com/";
const GOOGLE_HOME_URL = "https://www.google.com/";
const NAVIGATION_TIMEOUT_MS = 20_000;
const MAX_LOG_ENTRIES = 80;
const MAX_FAILURE_ENTRIES = 12;
const MAX_TOOL_HISTORY_ENTRIES = 20;
const TIMELINE_LIMIT = 8;
const POST_ACTION_SETTLE_MS = {
  navigateLike: 1_000,
  scroll: 400,
} as const;

interface ActiveSession {
  memory: SessionMemory;
  stopped: boolean;
  abortController: AbortController;
  lastPublicState: SessionPublicState;
}

function createSessionId() {
  return crypto.randomUUID();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isJdUrl(url?: string | null) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ["www.jd.com", "search.jd.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isScriptableUrl(url?: string | null) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function formatDetail(detail: unknown): string | undefined {
  if (detail === undefined) {
    return undefined;
  }

  if (typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function summarizeSemanticSnapshot(snapshot: SnapshotData["semanticSnapshot"]) {
  const topLevelRoleCounts: Record<string, number> = {};
  for (const node of snapshot.root.children ?? []) {
    topLevelRoleCounts[node.role] = (topLevelRoleCounts[node.role] ?? 0) + 1;
  }

  const topLevelRoles = Object.entries(topLevelRoleCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .reduce<Record<string, number>>((acc, [role, count]) => {
      acc[role] = count;
      return acc;
    }, {});

  return {
    nodeCount: snapshot.nodeCount,
    truncated: snapshot.truncated,
    topLevelRoles,
    hasDialog: !!snapshot.root.children?.some((node) => node.role === "dialog"),
    hasAlert: !!snapshot.root.children?.some((node) => node.role === "alert"),
    hasMain: !!snapshot.root.children?.some((node) => node.role === "main"),
    hasSearch: !!snapshot.root.children?.some((node) => node.role === "search"),
  };
}

function getElapsedMs(memory: SessionMemory, now = Date.now()) {
  return Math.max(0, now - memory.runtimeMeta.startedAt);
}

function buildTerminalFallbackOutput(memory: SessionMemory, overallStatus: "partial" | "failed", reason: string) {
  const issueSet = new Set([...(memory.unresolvedIssues ?? []), reason].filter(Boolean));
  const unresolvedIssues = Array.from(issueSet);
  const usedSubtasks = memory.plan
    .filter((step) => step.status !== "pending")
    .map((step) => step.stepId);
  const lines = [
    "## Status",
    overallStatus,
    "",
    "## Summary",
    reason,
    "",
    "## Progress",
    `- current step: ${memory.runtimeMeta.currentStep}`,
    `- current tool: ${memory.runtimeMeta.currentTool ?? "none"}`,
    `- elapsed ms: ${getElapsedMs(memory)}`,
  ];

  if (memory.taskType === "commerce_search") {
    lines.push(`- kept items: ${memory.extractedItems.length}`);
  } else {
    lines.push(`- source results: ${memory.researchSources.length}`);
  }

  lines.push("", "## Unresolved Issues");
  if (unresolvedIssues.length > 0) {
    for (const issue of unresolvedIssues) {
      lines.push(`- ${issue}`);
    }
  } else {
    lines.push("- none");
  }

  return {
    finalSummary: reason,
    finalOutput: lines.join("\n"),
    finalResult: {
      overallStatus,
      summaryMarkdown: lines.join("\n"),
      usedSubtasks,
      unresolvedIssues,
    },
  };
}

function ensureTerminalResult(memory: SessionMemory, reason: string) {
  if (memory.finalResult && memory.finalOutput) {
    return;
  }

  const overallStatus =
    memory.taskType === "commerce_search"
      ? memory.extractedItems.length > 0
        ? "partial"
        : "failed"
      : memory.researchSources.length > 0
        ? "partial"
        : "failed";
  const terminal = buildTerminalFallbackOutput(memory, overallStatus, reason);
  memory.finalSummary = terminal.finalSummary;
  memory.finalOutput = terminal.finalOutput;
  memory.finalResult = terminal.finalResult;
  memory.unresolvedIssues = terminal.finalResult.unresolvedIssues;
}

function toPublicState(memory: SessionMemory): SessionPublicState {
  const lastStep = memory.stepHistory.at(-1);
  return {
    sessionId: memory.runtimeMeta.sessionId,
    goal: memory.goal,
    taskType: memory.taskType,
    taskSpec: memory.taskSpec,
    taskPlan: memory.taskPlan,
    subtaskResults: memory.subtaskResults,
    status: memory.runtimeMeta.status,
    currentPhase: memory.currentPhase,
    currentStepId: memory.runtimeMeta.currentStepId,
    currentTool: memory.runtimeMeta.currentTool,
    currentStep: memory.runtimeMeta.currentStep,
    budgetLow: memory.runtimeMeta.budgetLow,
    elapsedMs: getElapsedMs(memory),
    plan: memory.plan,
    stepSummary: memory.liveStepSummary ?? lastStep?.stepSummary,
    lastAction: lastStep?.action,
    lastActionResult: lastStep?.actionResult,
    items: memory.extractedItems,
    rawItemCount: memory.rawExtractedItems.length,
    researchCandidates: memory.researchCandidates,
    researchSources: memory.researchSources,
    filterDiagnostics: memory.filterDiagnostics,
    logs: memory.logs,
    timeline: memory.stepHistory.slice(-TIMELINE_LIMIT),
    pageSnapshot: memory.pageSnapshot,
    recoveryHint: memory.recoveryHint,
    error: memory.lastError,
    unresolvedIssues: memory.unresolvedIssues,
    finalSummary: memory.finalSummary,
    finalOutput: memory.finalOutput,
    finalResult: memory.finalResult,
    updatedAt: Date.now(),
  };
}

async function waitForTabComplete(tabId: number, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<chrome.tabs.Tab> {
  const existing = await chrome.tabs.get(tabId);
  if (existing.status === "complete") {
    return existing;
  }

  return await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new RuntimeError("Timed out while waiting for the page to load.", "TAB_LOAD_TIMEOUT"));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId) {
        return;
      }

      if (changeInfo.status === "complete") {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getOrPrepareSessionTab(taskType: TaskType): Promise<{ tab: chrome.tabs.Tab; navigatedToHome: boolean; fromUrl?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new RuntimeError("No active tab is available.", "NO_ACTIVE_TAB");
  }

  if (taskType === "commerce_search") {
    if (isJdUrl(tab.url)) {
      const readyTab = await waitForTabComplete(tab.id);
      return { tab: readyTab, navigatedToHome: false, fromUrl: tab.url ?? undefined };
    }

    const fromUrl = tab.url ?? undefined;
    const updated = await chrome.tabs.update(tab.id, { url: JD_HOME_URL });
    if (!updated?.id) {
      throw new RuntimeError("Failed to navigate to the JD home page.", "TAB_UPDATE_FAILED");
    }

    const readyTab = await waitForTabComplete(updated.id);
    return { tab: readyTab, navigatedToHome: true, fromUrl };
  }

  if (isScriptableUrl(tab.url)) {
    const readyTab = await waitForTabComplete(tab.id);
    return { tab: readyTab, navigatedToHome: false, fromUrl: tab.url ?? undefined };
  }

  const fromUrl = tab.url ?? undefined;
  const updated = await chrome.tabs.update(tab.id, { url: GOOGLE_HOME_URL });
  if (!updated?.id) {
    throw new RuntimeError("Failed to navigate to Google home.", "TAB_UPDATE_FAILED");
  }

  const readyTab = await waitForTabComplete(updated.id);
  return { tab: readyTab, navigatedToHome: true, fromUrl };
}

async function broadcastUpdate(payload: SessionPublicState, asError = false) {
  try {
    await chrome.runtime.sendMessage({
      type: asError ? "SESSION_ERROR" : "SESSION_UPDATE",
      payload,
    });
  } catch {
    // Side panel may not be open.
  }
}

export function isReceiverMissingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Receiving end does not exist/i.test(message) || /Could not establish connection/i.test(message);
}

async function sendMessageThroughBridge<TResponse>(
  tabId: number,
  message: RequestSnapshotMessage | { type: "EXECUTE_ACTION"; action: AgentAction },
): Promise<TResponse | undefined> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (bridgeUrl, request) => {
      await import(bridgeUrl);
      const bridge = (globalThis as typeof globalThis & {
        __browserAgentMvpDirectBridge?: {
          scanCurrentPage: () => SnapshotData;
          executeCurrentAction: (action: AgentAction) => Promise<ToolResult>;
        };
      }).__browserAgentMvpDirectBridge;

      if (!bridge) {
        return undefined;
      }

      if (request.type === "REQUEST_SNAPSHOT") {
        return {
          ok: true,
          snapshot: bridge.scanCurrentPage(),
        };
      }

      try {
        const actionResult = await bridge.executeCurrentAction(request.action);
        return {
          ok: true,
          result: actionResult,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Action execution failed.",
        };
      }
    },
    args: [chrome.runtime.getURL("content-bridge.js"), message],
  });

  return result?.result as TResponse | undefined;
}

export async function sendMessageToTab<TResponse>(
  tabId: number,
  message: RequestSnapshotMessage | { type: "EXECUTE_ACTION"; action: AgentAction },
): Promise<TResponse> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
  } catch (error) {
    if (!isReceiverMissingError(error)) {
      throw error;
    }

    const bridgedResponse = await sendMessageThroughBridge<TResponse>(tabId, message);
    if (bridgedResponse) {
      return bridgedResponse;
    }

    return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
  }
}

function throwIfStopped(session: ActiveSession) {
  if (session.stopped || session.abortController.signal.aborted) {
    throw new RuntimeError("The session was stopped.", "SESSION_STOPPED");
  }
}

function appendLog(
  session: ActiveSession,
  source: DebugLogEntry["source"],
  level: DebugLogLevel,
  message: string,
  detail?: unknown,
) {
  const entry: DebugLogEntry = {
    timestamp: Date.now(),
    source,
    level,
    message,
    detail: formatDetail(detail),
  };
  session.memory.logs = [...session.memory.logs, entry].slice(-MAX_LOG_ENTRIES);
}

function getPostActionSettleDelay(action: AgentAction) {
  if (action.type === "SCROLL") {
    return POST_ACTION_SETTLE_MS.scroll;
  }

  if (action.type === "RECOVER_CLOSE_DIALOG") {
    return POST_ACTION_SETTLE_MS.scroll;
  }

  if (action.type === "CLICK" || action.type === "NAVIGATE" || (action.type === "TYPE" && action.submit)) {
    return POST_ACTION_SETTLE_MS.navigateLike;
  }

  return 0;
}

export function evaluateRuntimeBudget(memory: SessionMemory, now = Date.now()) {
  const elapsedMs = getElapsedMs(memory, now);
  const budgetLow = memory.runtimeMeta.currentStep >= LIMITS.SOFT_STEP_LIMIT || elapsedMs >= LIMITS.SOFT_ELAPSED_MS;

  if (elapsedMs >= LIMITS.MAX_ELAPSED_MS) {
    return {
      elapsedMs,
      budgetLow,
      hardStopCode: "MAX_ELAPSED_REACHED",
      hardStopReason: "Exceeded the maximum runtime duration.",
    };
  }

  if (memory.runtimeMeta.currentStep >= LIMITS.MAX_TOTAL_STEPS) {
    return {
      elapsedMs,
      budgetLow,
      hardStopCode: "MAX_STEPS_REACHED",
      hardStopReason: "Exceeded the maximum number of runtime steps.",
    };
  }

  return {
    elapsedMs,
    budgetLow,
  };
}

function getCurrentPlanStep(memory: SessionMemory): PlanStep | undefined {
  return memory.plan.find((step) => step.status === "running") ?? memory.plan.find((step) => step.status === "pending");
}

function updateCurrentStepId(memory: SessionMemory) {
  memory.runtimeMeta.currentStepId = getCurrentPlanStep(memory)?.stepId;
}

function markPlanStepRunning(memory: SessionMemory): PlanStep {
  const step = getCurrentPlanStep(memory);
  if (!step) {
    throw new RuntimeError("No runnable plan step is available.", "PLAN_STEP_MISSING");
  }

  if (step.status === "pending") {
    step.status = "running";
  }

  updateCurrentStepId(memory);
  return step;
}

function setPlanStepStatus(memory: SessionMemory, stepId: string, status: PlanStepStatus) {
  const step = memory.plan.find((item) => item.stepId === stepId);
  if (step) {
    step.status = status;
  }
  updateCurrentStepId(memory);
}

function resolveStepStatus(step: PlanStep, result: ToolExecutionResult): PlanStepStatus {
  switch (step.stepId) {
    case "compile-commerce-task":
    case "compile-research-task":
    case "search-commerce-results":
    case "search-research-results":
      return "succeeded";
    case "extract-commerce-results":
    case "extract-research-results":
      return result.nextPhase === "filtering" ? "succeeded" : "running";
    case "filter-commerce-results":
      return result.nextPhase === "aggregating" ? "succeeded" : "running";
    case "filter-research-results":
      return result.nextPhase === "reading" || result.nextPhase === "aggregating" ? "succeeded" : "running";
    case "read-research-results":
      return result.nextPhase === "aggregating" ? "succeeded" : "running";
    case "aggregate-commerce-results":
    case "aggregate-research-results":
      return result.nextPhase === "done" || result.stop ? "succeeded" : "running";
    default:
      return result.stop ? "succeeded" : "running";
  }
}

export class BrowserAgentRuntime {
  private activeSession?: ActiveSession;

  getState(): SessionPublicState {
    return (
      this.activeSession?.lastPublicState ?? {
        status: "idle",
        currentStep: 0,
        plan: [],
        items: [],
        logs: [],
        timeline: [],
        updatedAt: Date.now(),
      }
    );
  }

  async start(goal: string): Promise<StartSessionResponse> {
    if (this.activeSession) {
      this.stop();
    }

    const route = await detectTaskTypeWithLiteModel(goal, {
      classifyWithLiteModel: async (routeGoal) => {
        const classified = await classifyTaskType(routeGoal);
        return {
          taskType: classified.taskType,
          reason: classified.reason,
        };
      },
    });

    const taskType = route.taskType;
    const { tab, navigatedToHome, fromUrl } = await getOrPrepareSessionTab(taskType);
    const sessionId = createSessionId();
    const initialTaskPlan = buildTaskPlan(taskType);
    const memory: SessionMemory = {
      goal,
      taskType,
      currentPhase: "planning",
      plan: buildPlanSteps(initialTaskPlan.subtasks),
      taskPlan: initialTaskPlan,
      subtaskResults: [],
      toolHistory: [],
      currentFacts: {},
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
        navigatedToHome && taskType === "commerce_search"
          ? "Detected a non-JD page and opened jd.com automatically."
          : navigatedToHome && taskType === "public_research"
            ? "Detected a non-scriptable page and opened Google automatically."
            : "Ready to start the session.",
      runtimeMeta: {
        sessionId,
        tabId: tab.id!,
        pageType: "unknown",
        status: "idle",
        currentStepId: undefined,
        currentTool: undefined,
        currentStep: 0,
        budgetLow: false,
        llmRetryCount: 0,
        actionRetryCount: 0,
        pageReadyRetryCount: 0,
        recoveryCount: 0,
        pageWaitRecoveryCount: 0,
        dialogCloseRecoveryCount: 0,
        searchReopenRecoveryCount: 0,
        queryRefineTried: false,
        startedAt: Date.now(),
      },
    };
    updateCurrentStepId(memory);

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

    this.activeSession = session;
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
    void this.runSession(session);

    return {
      ok: true,
      payload: session.lastPublicState,
    };
  }

  stop() {
    if (!this.activeSession) {
      return;
    }

    appendLog(this.activeSession, "runtime", "warn", "Stop requested.");
    this.activeSession.stopped = true;
    this.activeSession.abortController.abort();
    ensureTerminalResult(this.activeSession.memory, "The session was stopped before completion.");
    this.activeSession.memory.runtimeMeta.status = "idle";
    this.activeSession.memory.runtimeMeta.currentTool = undefined;
    this.activeSession.memory.liveStepSummary = "Session stopped.";
    this.activeSession.memory.recoveryHint = undefined;
    this.activeSession.lastPublicState = toPublicState(this.activeSession.memory);
    void broadcastUpdate(this.activeSession.lastPublicState);
    this.activeSession = undefined;
  }

  private async runSession(session: ActiveSession) {
    try {
      await this.runLoop(session);
    } catch (error) {
      if (error instanceof RuntimeError && error.code === "SESSION_STOPPED") {
        appendLog(session, "runtime", "warn", "Session stopped.");
        return;
      }

      if (session.stopped) {
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown runtime error.";
      appendLog(session, "runtime", "error", "Runtime failed.", { message });
      session.memory.runtimeMeta.status = "error";
      session.memory.runtimeMeta.currentTool = undefined;
      session.memory.lastError = message;
      ensureTerminalResult(session.memory, message);
      session.memory.liveStepSummary = "Session failed.";
      session.lastPublicState = toPublicState(session.memory);
      await broadcastUpdate(session.lastPublicState, true);
    }
  }

  private async runLoop(session: ActiveSession) {
    while (!session.stopped) {
      throwIfStopped(session);

      if (session.memory.currentPhase === "done") {
        return;
      }

      const budget = evaluateRuntimeBudget(session.memory);
      if (budget.budgetLow && !session.memory.runtimeMeta.budgetLow) {
        session.memory.runtimeMeta.budgetLow = true;
        appendLog(session, "runtime", "warn", "Runtime budget is getting low.", {
          currentStep: session.memory.runtimeMeta.currentStep,
          elapsedMs: budget.elapsedMs,
        });
      }

      if (budget.hardStopReason) {
        throw new RuntimeError(budget.hardStopReason, budget.hardStopCode ?? "RUNTIME_BUDGET_EXHAUSTED");
      }

      const planStep = markPlanStepRunning(session.memory);
      const toolName = await this.chooseToolForStep(session, planStep);
      const result = await this.runTool(session, planStep, toolName);
      if (result.stop || result.nextPhase === "done") {
        return;
      }
    }
  }

  private async chooseToolForStep(session: ActiveSession, step: PlanStep): Promise<ToolName> {
    const selected = await chooseNextTool(
      {
        goal: session.memory.goal,
        taskType: session.memory.taskType,
        currentStep: step,
        budgetLow: session.memory.runtimeMeta.budgetLow,
        currentFacts: session.memory.currentFacts,
        unresolvedIssues: session.memory.unresolvedIssues,
      },
      {
        signal: session.abortController.signal,
      },
    );

    if (!step.allowedTools.includes(selected.toolName)) {
      throw new RuntimeError("Selected tool is not allowed for the current step.", "TOOL_NOT_ALLOWED");
    }

    appendLog(session, "llm", "info", "Selected the next tool for the current plan step.", {
      stepId: step.stepId,
      allowedTools: step.allowedTools,
      selectedTool: selected.toolName,
      reason: selected.reason,
      source: selected.source,
      provider: selected.provider,
      model: selected.model,
    });

    return selected.toolName;
  }

  private async runTool(session: ActiveSession, planStep: PlanStep, toolName: ToolName): Promise<ToolExecutionResult> {
    const tool = getToolDefinition(toolName);
    const phase = session.memory.currentPhase;
    session.memory.runtimeMeta.currentTool = toolName;
    session.memory.runtimeMeta.currentStep += 1;
    appendLog(session, "runtime", "info", "Running high-level tool.", {
      stepId: planStep.stepId,
      stepGoal: planStep.goal,
      toolName,
      phase,
      taskType: session.memory.taskType,
    });
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);

    try {
      const result = await tool.run({
        memory: session.memory,
        signal: session.abortController.signal,
        scanPage: () => this.scanPage(session),
        ensureUsableSnapshot: () => this.ensureUsableSnapshot(session),
        executeAction: (action, stepSummary) => this.executeAction(session, action, stepSummary),
        settleAfterAction: (action) => this.settleAfterAction(session, action),
        appendLog: (source, level, message, detail) => appendLog(session, source, level, message, detail),
        recordStep: (options) => this.recordStep(session, options),
        pushState: (stepSummary) => this.pushState(session, stepSummary),
      });

      session.memory.currentPhase = result.nextPhase;
      session.memory.runtimeMeta.currentTool = undefined;
      setPlanStepStatus(session.memory, planStep.stepId, resolveStepStatus(planStep, result));
      session.memory.toolHistory = [
        ...session.memory.toolHistory,
        {
          toolName,
          phase,
          status: "success",
          summary: result.summary,
          timestamp: Date.now(),
        },
      ].slice(-MAX_TOOL_HISTORY_ENTRIES);
      session.memory.subtaskResults = [
        ...session.memory.subtaskResults,
        {
          subtaskId: planStep.stepId,
          status: planStep.status === "succeeded" ? "success" : "partial",
          data: {
            phase,
            toolName,
            summary: result.summary,
          },
          diagnostics: [],
        },
      ];
      appendLog(session, "runtime", "info", "High-level tool completed.", {
        stepId: planStep.stepId,
        toolName,
        nextPhase: result.nextPhase,
        stepStatus: session.memory.plan.find((step) => step.stepId === planStep.stepId)?.status,
        summary: result.summary,
      });
      session.lastPublicState = toPublicState(session.memory);
      await broadcastUpdate(session.lastPublicState);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool error.";
      session.memory.runtimeMeta.currentTool = undefined;
      const status = error instanceof RuntimeError && error.code === "SEARCH_BLOCKED" ? "blocked" : "failed";
      setPlanStepStatus(session.memory, planStep.stepId, status);
      session.memory.toolHistory = [
        ...session.memory.toolHistory,
        {
          toolName,
          phase,
          status: "error",
          summary: message,
          timestamp: Date.now(),
        },
      ].slice(-MAX_TOOL_HISTORY_ENTRIES);
      session.memory.subtaskResults = [
        ...session.memory.subtaskResults,
        {
          subtaskId: planStep.stepId,
          status: "failed",
          data: {
            phase,
            toolName,
          },
          diagnostics: [message],
        },
      ];
      session.memory.failures = [
        ...session.memory.failures,
        {
          phase,
          toolName,
          message,
          timestamp: Date.now(),
        },
      ].slice(-MAX_FAILURE_ENTRIES);
      throw error;
    }
  }

  private async ensureUsableSnapshot(session: ActiveSession) {
    let snapshot = await this.scanPage(session);
    if (snapshot.pageReady.ready) {
      session.memory.runtimeMeta.pageWaitRecoveryCount = 0;
      return snapshot;
    }

    appendLog(session, "runtime", "warn", "Page is not ready yet; entering short wait.", snapshot.pageReady);
    session.memory.runtimeMeta.pageWaitRecoveryCount = 1;
    session.memory.recoveryHint = `${snapshot.pageReady.reason} (wait recovery 1/2)`;
    session.memory.liveStepSummary = "Waiting for the page to become usable.";
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);

    await sleep(LIMITS.PAGE_READY_WAIT_MS);
    snapshot = await this.scanPage(session);
    if (snapshot.pageReady.ready) {
      session.memory.runtimeMeta.pageWaitRecoveryCount = 0;
      session.memory.recoveryHint = undefined;
      return snapshot;
    }

    appendLog(session, "runtime", "warn", "Page is still not ready; running one last short retry.", snapshot.pageReady);
    session.memory.runtimeMeta.pageWaitRecoveryCount = 2;
    session.memory.recoveryHint = `${snapshot.pageReady.reason} (wait recovery 2/2)`;
    await sleep(LIMITS.PAGE_READY_SECOND_WAIT_MS);
    snapshot = await this.scanPage(session);
    if (snapshot.pageReady.ready) {
      session.memory.runtimeMeta.pageWaitRecoveryCount = 0;
      session.memory.recoveryHint = undefined;
      return snapshot;
    }

    throw new RuntimeError(`Page stayed unusable: ${snapshot.pageReady.reason}`, "PAGE_NOT_READY");
  }

  private async scanPage(session: ActiveSession): Promise<SnapshotData> {
    session.memory.runtimeMeta.status = "scanning";
    await this.pushState(session, "Scan the current page state.");

    let lastError: unknown;
    for (let attempt = 0; attempt < LIMITS.SNAPSHOT_RETRIES; attempt += 1) {
      throwIfStopped(session);

      try {
        const response = await sendMessageToTab<SnapshotResponse>(session.memory.runtimeMeta.tabId, {
          type: "REQUEST_SNAPSHOT",
        });

        if (!response.ok || !response.snapshot) {
          throw new RuntimeError(response.error ?? "Snapshot is empty.", "SNAPSHOT_ERROR");
        }

        session.memory.pageSnapshot = response.snapshot;
        session.memory.runtimeMeta.pageType = response.snapshot.pageType;
        appendLog(session, "content", "info", "Page scan completed.", {
          url: response.snapshot.url,
          title: response.snapshot.title,
          pageType: response.snapshot.pageType,
          pageReady: response.snapshot.pageReady,
          pageFacts: response.snapshot.pageFacts,
          semanticSnapshot: summarizeSemanticSnapshot(response.snapshot.semanticSnapshot),
        });
        return response.snapshot;
      } catch (error) {
        lastError = error;
        appendLog(session, "content", "warn", "Page scan failed, waiting to retry.", {
          attempt: attempt + 1,
          message: error instanceof Error ? error.message : "Unknown scan error",
        });
        await sleep(LIMITS.SNAPSHOT_RETRY_DELAY_MS);
      }
    }

    throw new RuntimeError(lastError instanceof Error ? lastError.message : "Page scan failed.", "SNAPSHOT_FAILED");
  }

  private async executeAction(
    session: ActiveSession,
    action: AgentAction,
    stepSummary: string,
  ): Promise<ToolResult> {
    session.memory.runtimeMeta.status = "acting";
    await this.pushState(session, stepSummary);
    appendLog(session, "runtime", "info", "Executing atomic action.", action);

    try {
      const response = await sendMessageToTab<ExecuteActionResponse>(session.memory.runtimeMeta.tabId, {
        type: "EXECUTE_ACTION",
        action,
      });
      if (!response.ok || !response.result) {
        throw new RuntimeError(response.error ?? "Action execution failed.", "ACTION_EXECUTION_ERROR");
      }
      session.memory.runtimeMeta.actionRetryCount = 0;
      return toolResultSchema.parse(response.result);
    } catch (error) {
      if (session.stopped) {
        throw new RuntimeError("The session was stopped.", "SESSION_STOPPED");
      }

      session.memory.runtimeMeta.actionRetryCount += 1;
      if (session.memory.runtimeMeta.actionRetryCount > LIMITS.MAX_ACTION_RETRIES) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Action execution failed.";
      appendLog(session, "runtime", "warn", "Atomic action failed; retrying.", {
        action,
        retryCount: session.memory.runtimeMeta.actionRetryCount,
        message,
      });
      session.memory.lastError = message;
      await sleep(300);
      return this.executeAction(session, action, stepSummary);
    }
  }

  private async settleAfterAction(session: ActiveSession, action: AgentAction) {
    const delayMs = getPostActionSettleDelay(action);
    const shouldWaitForTabLoad =
      action.type === "CLICK" || action.type === "NAVIGATE" || (action.type === "TYPE" && action.submit);

    if (delayMs <= 0 && !shouldWaitForTabLoad) {
      return;
    }

    appendLog(session, "runtime", "info", "Waiting for the page to settle after the action.", {
      actionType: action.type,
      delayMs,
    });

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    if (!shouldWaitForTabLoad) {
      return;
    }

    try {
      await waitForTabComplete(session.memory.runtimeMeta.tabId);
    } catch (error) {
      appendLog(session, "runtime", "warn", "Tab load wait failed; continue with a fresh scan.", {
        actionType: action.type,
        message: error instanceof Error ? error.message : "Unknown wait error",
      });
    }
  }

  private recordStep(
    session: ActiveSession,
    options: {
      stepSummary: string;
      nextIntent?: string;
      expectedOutcome?: string;
      action?: AgentAction;
      actionResult?: ToolResult;
      snapshot?: SnapshotData;
      snapshotSummary?: string;
    },
  ) {
    const record: StepRecord = {
      step: session.memory.stepHistory.length + 1,
      planStepId: session.memory.runtimeMeta.currentStepId,
      status: session.memory.runtimeMeta.status,
      stepSummary: options.stepSummary,
      nextIntent: options.nextIntent,
      expectedOutcome: options.expectedOutcome,
      action: options.action,
      actionResult: options.actionResult,
      snapshotSummary: options.snapshotSummary ?? (options.snapshot ? summarizeSnapshot(options.snapshot) : undefined),
      timestamp: Date.now(),
    };

    session.memory.stepHistory.push(record);
  }

  private async pushState(session: ActiveSession, stepSummary?: string) {
    if (session.stopped) {
      return;
    }
    if (stepSummary) {
      session.memory.liveStepSummary = stepSummary;
    }
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState, session.memory.runtimeMeta.status === "error");
  }
}
