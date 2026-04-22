import { LIMITS } from "../../shared/constants";
import { RuntimeError } from "../../shared/errors";
import type {
  ActionResult,
  AgentAction,
  PlanStep,
  PlanStepStatus,
  SessionMemory,
  SnapshotData,
  ToolName,
  ToolResult,
} from "../../shared/types";
import { chooseNextTool } from "../llm-client";
import { getToolDefinition, type LegacyToolName } from "../tools/registry";
import type { StepOptions } from "../tools/shared";
import { ensureTerminalResult } from "./public-state";
import type { ActiveSession } from "./shared";
import {
  appendLog,
  captureProgressSnapshot,
  detectProgress,
  markToolFailure,
  MAX_CONSECUTIVE_NO_PROGRESS,
  MAX_SAME_TOOL_RETRIES,
  MAX_TOOL_HISTORY_ENTRIES,
} from "./shared";

export function evaluateRuntimeBudget(memory: SessionMemory, now = Date.now()) {
  const elapsedMs = Math.max(0, now - memory.runtimeMeta.startedAt);
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

function allPlanStepsFinished(memory: SessionMemory) {
  return memory.plan.every((step) => step.status !== "pending" && step.status !== "running");
}

export function applyRetryGuardrails(session: ActiveSession, toolName: ToolName, result: ToolResult, madeProgress: boolean) {
  if (result.status === "retryable_error") {
    if (session.memory.runtimeMeta.sameToolRetryTool === toolName) {
      session.memory.runtimeMeta.sameToolRetryCount += 1;
    } else {
      session.memory.runtimeMeta.sameToolRetryTool = toolName;
      session.memory.runtimeMeta.sameToolRetryCount = 1;
    }

    if (session.memory.runtimeMeta.sameToolRetryCount >= MAX_SAME_TOOL_RETRIES) {
      throw new RuntimeError(
        `Tool ${toolName} reached the retry limit (${MAX_SAME_TOOL_RETRIES}) without recovery.`,
        "MAX_SAME_TOOL_RETRIES_REACHED",
      );
    }
  } else {
    session.memory.runtimeMeta.sameToolRetryCount = 0;
    session.memory.runtimeMeta.sameToolRetryTool = undefined;
  }

  if (madeProgress) {
    session.memory.runtimeMeta.consecutiveNoProgressCount = 0;
    return;
  }

  session.memory.runtimeMeta.consecutiveNoProgressCount += 1;
  if (session.memory.runtimeMeta.consecutiveNoProgressCount >= MAX_CONSECUTIVE_NO_PROGRESS) {
    throw new RuntimeError(
      `Runtime observed no meaningful progress for ${MAX_CONSECUTIVE_NO_PROGRESS} consecutive tool runs.`,
      "MAX_NO_PROGRESS_REACHED",
    );
  }
}

export async function chooseToolForStep(session: ActiveSession, step: PlanStep): Promise<ToolName> {
  const fallbackTool = step.allowedTools[0];
  if (!fallbackTool) {
    throw new RuntimeError("Current plan step does not expose any allowed tools.", "NO_ALLOWED_TOOLS");
  }

  if (step.allowedTools.length === 1) {
    appendLog(session, "runtime", "info", "Using the only allowed tool for the current plan step.", {
      stepId: step.stepId,
      toolName: fallbackTool,
    });
    return fallbackTool;
  }

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

async function runToolForPlanStep(
  session: ActiveSession,
  planStep: PlanStep,
  toolName: ToolName,
  deps: {
    publishState(session: ActiveSession, asError?: boolean): Promise<void>;
    scanPage(): Promise<SnapshotData>;
    ensureUsableSnapshot(): Promise<SnapshotData>;
    executeAction(action: AgentAction, stepSummary: string): Promise<ActionResult>;
    settleAfterAction(action: AgentAction): Promise<void>;
    recordStep(options: StepOptions): void;
    pushState(stepSummary?: string): Promise<void>;
  },
): Promise<ToolResult> {
  const tool = getToolDefinition(toolName as LegacyToolName);
  session.memory.runtimeMeta.currentTool = toolName;
  session.memory.runtimeMeta.currentStep += 1;
  appendLog(session, "runtime", "info", "Running high-level tool.", {
    stepId: planStep.stepId,
    stepGoal: planStep.goal,
    toolName,
    taskType: session.memory.taskType,
  });
  await deps.publishState(session);

  try {
    const result = await tool.run({
      memory: session.memory,
      signal: session.abortController.signal,
      scanPage: () => deps.scanPage(),
      ensureUsableSnapshot: () => deps.ensureUsableSnapshot(),
      executeAction: (action, stepSummary) => deps.executeAction(action, stepSummary),
      settleAfterAction: (action) => deps.settleAfterAction(action),
      appendLog: (source, level, message, detail) => appendLog(session, source, level, message, detail),
      recordStep: (options) => deps.recordStep(options),
      pushState: (stepSummary) => deps.pushState(stepSummary),
    });

    session.memory.currentFacts = {
      ...session.memory.currentFacts,
      ...result.facts,
    };
    if ("finalResult" in result.outputs && result.outputs.finalResult && !session.memory.finalResult) {
      session.memory.finalResult = result.outputs.finalResult as SessionMemory["finalResult"];
    }
    session.memory.recoveryHint = result.retryHint;
    session.memory.lastError = result.status === "retryable_error" || result.status === "fatal_error" ? result.summary : undefined;
    session.memory.runtimeMeta.currentTool = undefined;
    setPlanStepStatus(session.memory, planStep.stepId, result.stepStatus);
    session.memory.toolHistory = [
      ...session.memory.toolHistory,
      {
        toolName,
        status: result.status,
        summary: result.summary,
        stepStatus: result.stepStatus,
        timestamp: Date.now(),
      },
    ].slice(-MAX_TOOL_HISTORY_ENTRIES);

    appendLog(session, "runtime", result.status === "success" ? "info" : "warn", "High-level tool completed.", {
      stepId: planStep.stepId,
      toolName,
      status: result.status,
      stepStatus: result.stepStatus,
      summary: result.summary,
    });
    await deps.publishState(session);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool error.";
    session.memory.runtimeMeta.currentTool = undefined;
    const status: PlanStepStatus = error instanceof RuntimeError && error.code === "SEARCH_BLOCKED" ? "blocked" : "failed";
    setPlanStepStatus(session.memory, planStep.stepId, status);
    markToolFailure(session, toolName, message, error instanceof RuntimeError ? error.code : undefined, status);
    throw error;
  }
}

export async function runRuntimeLoop(
  session: ActiveSession,
  deps: {
    publishState(session: ActiveSession, asError?: boolean): Promise<void>;
    scanPage(): Promise<SnapshotData>;
    ensureUsableSnapshot(): Promise<SnapshotData>;
    executeAction(action: AgentAction, stepSummary: string): Promise<ActionResult>;
    settleAfterAction(action: AgentAction): Promise<void>;
    recordStep(options: StepOptions): void;
    pushState(stepSummary?: string): Promise<void>;
  },
) {
  session.memory.runtimeMeta.status = "running";

  while (!session.stopped) {
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
    const toolName = await chooseToolForStep(session, planStep);
    const before = captureProgressSnapshot(session.memory);
    const result = await runToolForPlanStep(session, planStep, toolName, deps);
    const madeProgress = detectProgress(session.memory, before, result);

    applyRetryGuardrails(session, toolName, result, madeProgress);

    if (result.stepStatus === "failed" || result.stepStatus === "blocked") {
      ensureTerminalResult(session.memory, result.summary, result.stepStatus === "blocked" ? "blocked" : "failed");
      session.memory.runtimeMeta.status = "done";
      session.memory.runtimeMeta.currentTool = undefined;
      session.memory.liveStepSummary = "Session stopped after a blocking step.";
      await deps.publishState(session);
      return;
    }

    if (result.terminal || session.memory.finalResult) {
      session.memory.runtimeMeta.status = "done";
      session.memory.runtimeMeta.currentTool = undefined;
      session.memory.liveStepSummary = "Final result is ready.";
      await deps.publishState(session);
      return;
    }

    if (allPlanStepsFinished(session.memory)) {
      ensureTerminalResult(session.memory, "The plan completed without a final result.", "partial");
      session.memory.runtimeMeta.status = "done";
      session.memory.runtimeMeta.currentTool = undefined;
      session.memory.liveStepSummary = "Plan completed.";
      await deps.publishState(session);
      return;
    }
  }
}
