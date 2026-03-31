import { LIMITS } from "../shared/constants";
import type { ExecuteActionResponse, RequestSnapshotMessage, SnapshotResponse, StartSessionResponse } from "../shared/protocol";
import { toolResultSchema } from "../shared/schema";
import type {
  AgentAction,
  LlmDecision,
  SessionMemory,
  SessionPublicState,
  SnapshotData,
  StepRecord,
  ToolResult,
} from "../shared/types";
import { RuntimeError } from "../shared/errors";
import {
  compareExpectedOutcome,
  ensureActionAllowed,
  ensureDoneAllowed,
  isRepeatedAction,
  normalizeDecision,
  summarizeSnapshot,
} from "./guards";
import { requestDecision, requestPlan } from "./llm-client";

interface ActiveSession {
  memory: SessionMemory;
  stopped: boolean;
  lastPublicState: SessionPublicState;
}

function createSessionId() {
  return crypto.randomUUID();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPublicState(memory: SessionMemory): SessionPublicState {
  const lastStep = memory.stepHistory.at(-1);
  return {
    sessionId: memory.runtimeMeta.sessionId,
    goal: memory.goal,
    status: memory.runtimeMeta.status,
    currentStep: memory.runtimeMeta.currentStep,
    plan: memory.plan,
    stepSummary: memory.liveStepSummary ?? lastStep?.stepSummary,
    lastAction: lastStep?.action,
    lastActionResult: lastStep?.actionResult,
    items: memory.extractedItems,
    error: memory.lastError,
    finalSummary: memory.finalSummary,
    updatedAt: Date.now(),
  };
}

async function getActiveJdTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new RuntimeError("No active tab found.", "NO_ACTIVE_TAB");
  }

  const url = new URL(tab.url);
  if (!["www.jd.com", "search.jd.com"].includes(url.hostname)) {
    throw new RuntimeError("Active tab must be JD home or JD search.", "INVALID_ACTIVE_TAB");
  }

  return tab;
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

async function sendMessageToTab<TResponse>(
  tabId: number,
  message: RequestSnapshotMessage | { type: "EXECUTE_ACTION"; action: AgentAction },
): Promise<TResponse> {
  return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
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
        updatedAt: Date.now(),
      }
    );
  }

  async start(goal: string): Promise<StartSessionResponse> {
    if (this.activeSession) {
      this.stop();
    }

    const tab = await getActiveJdTab();
    const sessionId = createSessionId();
    const memory: SessionMemory = {
      goal,
      plan: [],
      stepHistory: [],
      extractedItems: [],
      runtimeMeta: {
        sessionId,
        tabId: tab.id!,
        pageType: "unknown",
        status: "idle",
        currentStep: 0,
        llmRetryCount: 0,
        actionRetryCount: 0,
        startedAt: Date.now(),
      },
    };

    const session: ActiveSession = {
      memory,
      stopped: false,
      lastPublicState: toPublicState(memory),
    };

    this.activeSession = session;
    void this.runSession(session);

    return {
      ok: true,
      payload: session.lastPublicState,
    };
  }

  stop() {
    if (this.activeSession) {
      this.activeSession.stopped = true;
      this.activeSession.memory.runtimeMeta.status = "idle";
      this.activeSession.memory.liveStepSummary = "Session stopped";
      this.activeSession.lastPublicState = toPublicState(this.activeSession.memory);
      void broadcastUpdate(this.activeSession.lastPublicState);
    }
    this.activeSession = undefined;
  }

  private async runSession(session: ActiveSession) {
    try {
      await this.runLoop(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown runtime error.";
      session.memory.runtimeMeta.status = "error";
      session.memory.lastError = message;
      session.memory.liveStepSummary = "Session failed";
      session.lastPublicState = toPublicState(session.memory);
      await broadcastUpdate(session.lastPublicState, true);
    }
  }

  private async runLoop(session: ActiveSession) {
    while (!session.stopped) {
      if (session.memory.runtimeMeta.currentStep >= LIMITS.MAX_STEPS) {
        throw new RuntimeError("Exceeded maximum step limit.", "MAX_STEPS_REACHED");
      }

      const beforeSnapshot = await this.scanPage(session);

      if (session.memory.plan.length === 0) {
        session.memory.runtimeMeta.status = "planning";
        await this.pushState(session, "Generating short execution plan");
        const plan = await requestPlan(session.memory);
        session.memory.plan = plan.plan;
        await this.pushState(session, `Plan ready: ${plan.plan.join(" / ")}`);
      }

      const decision = await this.getDecision(session);
      const normalizedDecision = normalizeDecision(decision);

      ensureActionAllowed(session.memory.pageSnapshot, normalizedDecision.action);
      if (isRepeatedAction(session.memory, normalizedDecision.action)) {
        throw new RuntimeError("Repeated failed action detected.", "REPEATED_ACTION");
      }
      ensureDoneAllowed(session.memory, normalizedDecision);

      if (normalizedDecision.action.type === "DONE") {
        session.memory.extractedItems = normalizedDecision.action.items?.length
          ? normalizedDecision.action.items
          : session.memory.extractedItems;
        session.memory.finalSummary = normalizedDecision.action.summary;
        session.memory.runtimeMeta.status = "done";
        session.memory.liveStepSummary = normalizedDecision.stepSummary;
        session.memory.stepHistory.push(this.createStepRecord(session, normalizedDecision, undefined, beforeSnapshot));
        session.lastPublicState = toPublicState(session.memory);
        await broadcastUpdate(session.lastPublicState);
        return;
      }

      const result = await this.executeAction(session, normalizedDecision.action, normalizedDecision.stepSummary);
      const afterSnapshot = await this.scanPage(session);
      const compareResult = compareExpectedOutcome(
        beforeSnapshot,
        afterSnapshot,
        normalizedDecision.expectedOutcome,
        normalizedDecision.action,
      );

      if (result.items?.length) {
        session.memory.extractedItems = result.items;
      } else if (afterSnapshot.productCandidates.length) {
        session.memory.extractedItems = afterSnapshot.productCandidates;
      }

      session.memory.nextIntent = normalizedDecision.nextIntent;
      session.memory.runtimeMeta.currentStep += 1;
      session.memory.runtimeMeta.actionRetryCount = 0;
      session.memory.runtimeMeta.status = "observing";
      session.memory.liveStepSummary = normalizedDecision.stepSummary;
      session.memory.stepHistory.push(
        this.createStepRecord(
          session,
          normalizedDecision,
          {
            ...result,
            message: `${result.message}; ${compareResult.reason}`,
          },
          afterSnapshot,
        ),
      );

      session.memory.lastError =
        !compareResult.matched && normalizedDecision.action.type !== "SCROLL"
          ? compareResult.reason
          : undefined;

      session.lastPublicState = toPublicState(session.memory);
      await broadcastUpdate(session.lastPublicState);
      await sleep(400);
    }
  }

  private async getDecision(session: ActiveSession): Promise<LlmDecision> {
    session.memory.runtimeMeta.status = "planning";
    await this.pushState(session, "Requesting next action from model");

    try {
      const decision = await requestDecision(session.memory);
      session.memory.runtimeMeta.llmRetryCount = 0;
      return decision;
    } catch (error) {
      session.memory.runtimeMeta.llmRetryCount += 1;
      if (session.memory.runtimeMeta.llmRetryCount >= LIMITS.MAX_LLM_RETRIES) {
        throw error;
      }
      session.memory.lastError = error instanceof Error ? error.message : "LLM decision failed.";
      return this.getDecision(session);
    }
  }

  private async scanPage(session: ActiveSession): Promise<SnapshotData> {
    session.memory.runtimeMeta.status = "scanning";
    await this.pushState(session, "Scanning page");

    let lastError: unknown;
    for (let attempt = 0; attempt < LIMITS.SNAPSHOT_RETRIES; attempt += 1) {
      try {
        const response = await sendMessageToTab<SnapshotResponse>(session.memory.runtimeMeta.tabId, {
          type: "REQUEST_SNAPSHOT",
        });
        if (!response.ok || !response.snapshot) {
          throw new RuntimeError(response.error ?? "Snapshot payload is empty.", "SNAPSHOT_ERROR");
        }

        session.memory.pageSnapshot = response.snapshot;
        session.memory.runtimeMeta.pageType = response.snapshot.pageType;
        return response.snapshot;
      } catch (error) {
        lastError = error;
        await sleep(LIMITS.SNAPSHOT_RETRY_DELAY_MS);
      }
    }

    throw new RuntimeError(
      lastError instanceof Error ? lastError.message : "Failed to scan page.",
      "SNAPSHOT_FAILED",
    );
  }

  private async executeAction(
    session: ActiveSession,
    action: AgentAction,
    stepSummary: string,
  ): Promise<ToolResult> {
    session.memory.runtimeMeta.status = "acting";
    await this.pushState(session, stepSummary);

    try {
      const response = await sendMessageToTab<ExecuteActionResponse>(session.memory.runtimeMeta.tabId, {
        type: "EXECUTE_ACTION",
        action,
      });
      if (!response.ok || !response.result) {
        throw new RuntimeError(response.error ?? "Action execution failed.", "ACTION_EXECUTION_ERROR");
      }
      return toolResultSchema.parse(response.result);
    } catch (error) {
      session.memory.runtimeMeta.actionRetryCount += 1;
      if (session.memory.runtimeMeta.actionRetryCount > LIMITS.MAX_ACTION_RETRIES) {
        throw error;
      }
      session.memory.lastError = error instanceof Error ? error.message : "Action execution failed.";
      await sleep(500);
      return this.executeAction(session, action, stepSummary);
    }
  }

  private createStepRecord(
    session: ActiveSession,
    decision: LlmDecision,
    result: ToolResult | undefined,
    snapshot: SnapshotData,
  ): StepRecord {
    return {
      step: session.memory.runtimeMeta.currentStep + 1,
      status: session.memory.runtimeMeta.status,
      stepSummary: decision.stepSummary,
      nextIntent: decision.nextIntent,
      expectedOutcome: decision.expectedOutcome,
      action: decision.action,
      actionResult: result,
      snapshotSummary: summarizeSnapshot(snapshot),
      timestamp: Date.now(),
    };
  }

  private async pushState(session: ActiveSession, stepSummary?: string) {
    if (stepSummary) {
      session.memory.liveStepSummary = stepSummary;
    }
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState, session.memory.runtimeMeta.status === "error");
  }
}
