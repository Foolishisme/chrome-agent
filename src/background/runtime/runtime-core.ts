import { RuntimeError } from "../../shared/errors";
import type { StartSessionResponse } from "../../shared/protocol";
import type { ActionResult, AgentAction, SessionDebugBundle, SessionPublicState, SnapshotData, StepRecord } from "../../shared/types";
import { evaluateRuntimeBudget, runBrowserCoreV2Loop } from "../runner";
import { setActiveLlmProfile } from "../llm/llm-client";
import { summarizeSnapshot } from "../guards";
import { saveSessionArchive } from "./session-archive";
import { createInitialSession } from "./bootstrap";
import { defaultPublicState, ensureTerminalResult, toPublicState } from "./public-state";
import {
  deleteSessionRunLog as deleteStoredSessionRunLog,
  exportSessionDebugBundle as exportStoredSessionDebugBundle,
  loadSessionRunLog,
  saveSessionRunDebugSnapshot,
} from "./run-log-store";
import type { ActiveSession } from "./shared";
import { appendLog } from "./shared";
import {
  ensureSessionUsableSnapshot,
  executeSessionAction,
  isReceiverMissingError,
  scanSessionPage,
  sendMessageToTab,
  settleSessionAfterAction,
} from "./tab-host";

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

export { evaluateRuntimeBudget, isReceiverMissingError, sendMessageToTab };

export class BrowserAgentRuntime {
  private activeSession?: ActiveSession;
  private lastPublicState?: SessionPublicState;
  private pendingStartAbortController?: AbortController;

  private throwIfStartStopped(controller: AbortController) {
    if (controller.signal.aborted) {
      throw new RuntimeError("The session was stopped.", "SESSION_STOPPED");
    }
  }

  private async publishSessionState(session: ActiveSession, asError = false) {
    session.lastPublicState = toPublicState(session.memory);
    this.lastPublicState = session.lastPublicState;
    await broadcastUpdate(session.lastPublicState, asError);
  }

  private async persistTerminalState(session: ActiveSession) {
    if (!session.memory.finalResult) {
      return;
    }

    await saveSessionRunDebugSnapshot(session.memory);
    await saveSessionArchive({
      sessionId: session.memory.runtimeMeta.sessionId,
      goal: session.memory.goal,
      finalResult: session.memory.finalResult,
      timeline: session.memory.stepHistory,
      conversationId: session.memory.conversationId,
      conversationTitle: session.memory.conversationTitle,
    });
  }

  getState(): SessionPublicState {
    return this.activeSession?.lastPublicState ?? this.lastPublicState ?? defaultPublicState();
  }

  async start(
    goal: string,
    options: {
      conversationId?: string;
      conversationTitle?: string;
      conversationTurns?: SessionPublicState["conversationTurns"];
      currentTurnId?: number;
      searchPreference?: SessionPublicState["searchPreference"];
      llmProfile?: SessionPublicState["llmProfile"];
    } = {},
  ): Promise<StartSessionResponse> {
    if (this.activeSession) {
      this.stop();
    }

    if (this.pendingStartAbortController) {
      this.pendingStartAbortController.abort();
      this.pendingStartAbortController = undefined;
    }

    const startAbortController = new AbortController();
    this.pendingStartAbortController = startAbortController;

    try {
      setActiveLlmProfile(options.llmProfile);
      const { session } = await createInitialSession(goal, {
        ...options,
        signal: startAbortController.signal,
      });
      this.throwIfStartStopped(startAbortController);

      this.activeSession = session;
      this.pendingStartAbortController = undefined;
      await this.publishSessionState(session);
      void this.runSession(session);

      return {
        ok: true,
        payload: session.lastPublicState,
      };
    } finally {
      if (this.pendingStartAbortController === startAbortController) {
        this.pendingStartAbortController = undefined;
      }
    }
  }

  stop() {
    if (this.pendingStartAbortController) {
      this.pendingStartAbortController.abort();
      this.pendingStartAbortController = undefined;
    }

    if (!this.activeSession) {
      return;
    }

    appendLog(this.activeSession, "runtime", "warn", "Stop requested.");
    this.activeSession.stopped = true;
    this.activeSession.abortController.abort();
    ensureTerminalResult(this.activeSession.memory, "The session was stopped before completion.", "partial");
    this.activeSession.memory.runtimeMeta.status = "done";
    this.activeSession.memory.runtimeMeta.currentTool = undefined;
    this.activeSession.memory.liveStepSummary = "Session stopped.";
    this.activeSession.memory.recoveryHint = undefined;
    void this.persistTerminalState(this.activeSession);
    void this.publishSessionState(this.activeSession);
    this.activeSession = undefined;
  }

  clearCompletedState(sessionId?: string): SessionPublicState {
    if (this.activeSession?.memory.runtimeMeta.status === "running") {
      throw new RuntimeError("Cannot clear a session while it is running.", "SESSION_RUNNING");
    }

    if (sessionId && this.lastPublicState?.sessionId && this.lastPublicState.sessionId !== sessionId) {
      return this.getState();
    }

    this.lastPublicState = defaultPublicState();
    return this.lastPublicState;
  }

  private async runSession(session: ActiveSession) {
    try {
      await runBrowserCoreV2Loop(session, {
        publishState: (currentSession, asError) => this.publishSessionState(currentSession, asError),
        scanPage: () => this.scanPage(session),
        ensureUsableSnapshot: () => this.ensureUsableSnapshot(session),
        executeAction: (action, stepSummary) => this.executeAction(session, action, stepSummary),
        settleAfterAction: (action) => this.settleAfterAction(session, action),
        recordStep: (options) => this.recordStep(session, options),
        pushState: (stepSummary) => this.pushState(session, stepSummary),
      });
      await this.persistTerminalState(session);
      this.lastPublicState = session.lastPublicState;
      if (this.activeSession === session) {
        this.activeSession = undefined;
      }
    } catch (error) {
      if (error instanceof RuntimeError && error.code === "SESSION_STOPPED") {
        appendLog(session, "runtime", "warn", "Session stopped.");
        this.lastPublicState = session.lastPublicState;
        if (this.activeSession === session) {
          this.activeSession = undefined;
        }
        return;
      }

      if (session.stopped) {
        this.lastPublicState = session.lastPublicState;
        if (this.activeSession === session) {
          this.activeSession = undefined;
        }
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown runtime error.";
      appendLog(session, "runtime", "error", "Runtime failed.", { message });
      session.memory.runtimeMeta.status = "error";
      session.memory.runtimeMeta.currentTool = undefined;
      session.memory.lastError = message;
      ensureTerminalResult(session.memory, message, "failed");
      session.memory.liveStepSummary = "Session failed.";
      if (this.activeSession === session) {
        this.activeSession = undefined;
      }
      await this.publishSessionState(session, true);
      await this.persistTerminalState(session);
    }
  }

  async getSessionRunLog(sessionId?: string) {
    const targetSessionId = sessionId ?? this.activeSession?.memory.runtimeMeta.sessionId ?? this.lastPublicState?.sessionId;
    if (!targetSessionId) {
      return [];
    }

    const stored = await loadSessionRunLog(targetSessionId);
    if (this.activeSession?.memory.runtimeMeta.sessionId === targetSessionId) {
      return stored?.runLogs ?? this.activeSession.memory.logs;
    }
    return stored?.runLogs ?? [];
  }

  async exportSessionDebugBundle(sessionId?: string): Promise<SessionDebugBundle | undefined> {
    const targetSessionId = sessionId ?? this.activeSession?.memory.runtimeMeta.sessionId ?? this.lastPublicState?.sessionId;
    if (!targetSessionId) {
      return undefined;
    }

    if (this.activeSession?.memory.runtimeMeta.sessionId === targetSessionId) {
      const stored = await loadSessionRunLog(targetSessionId);
      return {
        sessionId: targetSessionId,
        goal: this.activeSession.memory.goal,
        taskType: this.activeSession.memory.taskType,
        taskSpec: this.activeSession.memory.taskSpec,
        timeline: [...this.activeSession.memory.stepHistory],
        finalResult: this.activeSession.memory.finalResult,
        runLogs: stored?.runLogs ?? [...this.activeSession.memory.logs],
        filterDiagnostics: this.activeSession.memory.filterDiagnostics,
        unresolvedIssues: [...this.activeSession.memory.unresolvedIssues],
      };
    }

    return exportStoredSessionDebugBundle(targetSessionId);
  }

  async deleteSessionRunLog(sessionId: string) {
    await deleteStoredSessionRunLog(sessionId);
  }

  private async ensureUsableSnapshot(session: ActiveSession) {
    return ensureSessionUsableSnapshot(session, {
      scanPage: () => this.scanPage(session),
      publishState: () => this.publishSessionState(session),
    });
  }

  private async scanPage(session: ActiveSession): Promise<SnapshotData> {
    return scanSessionPage(session, {
      pushState: (stepSummary) => this.pushState(session, stepSummary),
    });
  }

  private async executeAction(
    session: ActiveSession,
    action: AgentAction,
    stepSummary: string,
  ): Promise<ActionResult> {
    return executeSessionAction(session, action, stepSummary, {
      pushState: (nextStepSummary) => this.pushState(session, nextStepSummary),
    });
  }

  private async settleAfterAction(session: ActiveSession, action: AgentAction) {
    return settleSessionAfterAction(session, action);
  }

  private recordStep(
    session: ActiveSession,
    options: {
      stepSummary: string;
      nextIntent?: string;
      expectedOutcome?: string;
      action?: AgentAction;
      actionResult?: ActionResult;
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

    await this.publishSessionState(session, session.memory.runtimeMeta.status === "error");
  }
}
