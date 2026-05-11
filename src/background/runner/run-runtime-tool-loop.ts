import { LIMITS } from "../../shared/agent-runtime-config";
import { RuntimeError } from "../../shared/runtime-error";
import type { SessionMemory } from "../../shared/agent-domain-model";
import type { ActiveSession } from "../runtime/runtime-session-state";
import type { BrowserDriver } from "../browser/capability/browser-driver-contract";
import {
  executeCommerceTask,
  executeDirectAnswerTask,
  executePublicResearchTask,
  executeSiteOverviewTask,
  type RuntimeToolLoopDeps,
} from "./task-executors";
import { createRuntimeBrowserDriver } from "./runtime-browser-driver";
import { createDefaultFirstPartyToolRegistry } from "../tools/first-party-tool-registry";

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

export async function runRuntimeToolLoop(
  session: ActiveSession,
  deps: RuntimeToolLoopDeps,
  options: {
    driver?: BrowserDriver;
    registry?: ReturnType<typeof createDefaultFirstPartyToolRegistry>;
  } = {},
) {
  session.memory.runtimeMeta.status = "running";

  const registry = options.registry ?? createDefaultFirstPartyToolRegistry();
  const driver =
    options.driver ??
    createRuntimeBrowserDriver({
      onTabChanged: (tabId) => {
        session.memory.runtimeMeta.tabId = tabId;
      },
      onSnapshot: (snapshot) => {
        session.memory.pageSnapshot = snapshot;
        session.memory.runtimeMeta.pageType = snapshot.pageType;
      },
    });

  const ensureBudget = async () => {
    const budget = evaluateRuntimeBudget(session.memory);
    if (budget.budgetLow && !session.memory.runtimeMeta.budgetLow) {
      session.memory.runtimeMeta.budgetLow = true;
      await deps.publishState(session);
    }

    if (budget.hardStopReason) {
      throw new RuntimeError(budget.hardStopReason, budget.hardStopCode ?? "RUNTIME_BUDGET_EXHAUSTED");
    }
  };

  await ensureBudget();

  const context = {
    session,
    deps,
    driver,
    registry,
    ensureBudget,
  } as const;

  if (!session.memory.taskSpec) {
    throw new RuntimeError("Task spec is missing before entering the runtime tool loop.", "TASK_SPEC_MISSING");
  }

  if (session.memory.taskSpec.taskType === "direct_answer") {
    await executeDirectAnswerTask(context);
    return;
  }

  if (session.memory.taskSpec.taskType === "commerce_search") {
    await executeCommerceTask(context);
    return;
  }

  if (session.memory.taskSpec.taskType === "site_overview") {
    await executeSiteOverviewTask(context);
    return;
  }

  await executePublicResearchTask(context);
}

