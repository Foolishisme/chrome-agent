import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type { ExecuteActionResponse, RequestSnapshotMessage, SnapshotResponse, StartSessionResponse } from "../shared/protocol";
import { toolResultSchema } from "../shared/schema";
import type {
  AgentAction,
  DebugLogEntry,
  DebugLogLevel,
  LlmDecision,
  SessionMemory,
  SessionPublicState,
  SnapshotData,
  StepRecord,
  ToolResult,
} from "../shared/types";
import {
  compareExpectedOutcome,
  ensureActionAllowed,
  ensureDoneAllowed,
  isRepeatedAction,
  normalizeDecision,
  summarizeSnapshot,
} from "./guards";
import { requestDecision, requestPlan } from "./llm-client";

const JD_HOME_URL = "https://www.jd.com/";
const NAVIGATION_TIMEOUT_MS = 20_000;
const MAX_LOG_ENTRIES = 80;
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
    logs: memory.logs,
    timeline: memory.stepHistory.slice(-TIMELINE_LIMIT),
    pageSnapshot: memory.pageSnapshot,
    recoveryHint: memory.recoveryHint,
    error: memory.lastError,
    finalSummary: memory.finalSummary,
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
      reject(new RuntimeError("等待页面加载超时。", "TAB_LOAD_TIMEOUT"));
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

async function getOrPrepareSessionTab(): Promise<{ tab: chrome.tabs.Tab; navigatedToHome: boolean; fromUrl?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new RuntimeError("未找到可用的活动标签页。", "NO_ACTIVE_TAB");
  }

  if (isJdUrl(tab.url)) {
    const readyTab = await waitForTabComplete(tab.id);
    return { tab: readyTab, navigatedToHome: false, fromUrl: tab.url ?? undefined };
  }

  const fromUrl = tab.url ?? undefined;
  const updated = await chrome.tabs.update(tab.id, { url: JD_HOME_URL });
  if (!updated?.id) {
    throw new RuntimeError("跳转京东首页失败。", "TAB_UPDATE_FAILED");
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

async function sendMessageToTab<TResponse>(
  tabId: number,
  message: RequestSnapshotMessage | { type: "EXECUTE_ACTION"; action: AgentAction },
): Promise<TResponse> {
  return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
}

function throwIfStopped(session: ActiveSession) {
  if (session.stopped || session.abortController.signal.aborted) {
    throw new RuntimeError("任务已停止。", "SESSION_STOPPED");
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

  if (action.type === "CLICK") {
    return POST_ACTION_SETTLE_MS.navigateLike;
  }

  if (action.type === "TYPE" && action.submit) {
    return POST_ACTION_SETTLE_MS.navigateLike;
  }

  return 0;
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

    const { tab, navigatedToHome, fromUrl } = await getOrPrepareSessionTab();
    const sessionId = createSessionId();
    const memory: SessionMemory = {
      goal,
      plan: [],
      stepHistory: [],
      logs: [],
      extractedItems: [],
      liveStepSummary: navigatedToHome ? "检测到当前不在京东页面，已自动打开京东首页。" : "准备启动任务。",
      runtimeMeta: {
        sessionId,
        tabId: tab.id!,
        pageType: "unknown",
        status: "idle",
        currentStep: 0,
        llmRetryCount: 0,
        actionRetryCount: 0,
        pageReadyRetryCount: 0,
        recoveryCount: 0,
        startedAt: Date.now(),
      },
    };

    const session: ActiveSession = {
      memory,
      stopped: false,
      abortController: new AbortController(),
      lastPublicState: toPublicState(memory),
    };

    appendLog(session, "runtime", "info", "任务启动。", {
      goal,
      tabId: tab.id,
      currentUrl: tab.url,
    });

    if (navigatedToHome) {
      appendLog(session, "runtime", "warn", "已从非京东页面自动跳转到京东首页。", {
        fromUrl,
        toUrl: tab.url,
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

    appendLog(this.activeSession, "runtime", "warn", "收到停止请求。");
    this.activeSession.stopped = true;
    this.activeSession.abortController.abort();
    this.activeSession.memory.runtimeMeta.status = "idle";
    this.activeSession.memory.liveStepSummary = "任务已停止。";
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
        appendLog(session, "runtime", "warn", "任务已终止。");
        return;
      }

      if (session.stopped) {
        return;
      }

      const message = error instanceof Error ? error.message : "运行时发生未知错误。";
      appendLog(session, "runtime", "error", "运行时异常。", { message });
      session.memory.runtimeMeta.status = "error";
      session.memory.lastError = message;
      session.memory.liveStepSummary = "任务执行失败。";
      session.lastPublicState = toPublicState(session.memory);
      await broadcastUpdate(session.lastPublicState, true);
    }
  }

  private async runLoop(session: ActiveSession) {
    while (!session.stopped) {
      throwIfStopped(session);

      if (session.memory.runtimeMeta.currentStep >= LIMITS.MAX_STEPS) {
        throw new RuntimeError("超过最大执行步数限制。", "MAX_STEPS_REACHED");
      }

      const beforeSnapshot = await this.scanPage(session);
      throwIfStopped(session);

      const pageReady = await this.ensurePageReady(session, beforeSnapshot);
      if (!pageReady) {
        continue;
      }

      if (session.memory.plan.length === 0) {
        session.memory.runtimeMeta.status = "planning";
        await this.pushState(session, "生成最短执行计划。");
        const plan = await requestPlan(session.memory, { signal: session.abortController.signal });
        throwIfStopped(session);
        session.memory.plan = plan.plan;
        appendLog(session, "llm", "info", "模型已生成执行计划。", plan.plan);
        await this.pushState(session, `计划已生成：${plan.plan.join(" / ")}`);
      }

      const decision = await this.getDecision(session);
      throwIfStopped(session);
      const normalizedDecision = normalizeDecision(decision);
      appendLog(session, "llm", "info", "模型返回下一步动作。", {
        action: normalizedDecision.action,
        expectedOutcome: normalizedDecision.expectedOutcome,
        nextIntent: normalizedDecision.nextIntent,
        done: normalizedDecision.done,
      });

      ensureActionAllowed(session.memory.pageSnapshot, normalizedDecision.action);
      if (isRepeatedAction(session.memory, normalizedDecision.action)) {
        throw new RuntimeError("检测到重复失败动作，任务已终止。", "REPEATED_ACTION");
      }
      ensureDoneAllowed(session.memory, normalizedDecision);

      if (normalizedDecision.action.type === "DONE") {
        session.memory.extractedItems = normalizedDecision.action.items?.length
          ? normalizedDecision.action.items
          : session.memory.extractedItems;
        session.memory.finalSummary = normalizedDecision.action.summary;
        session.memory.runtimeMeta.status = "done";
        session.memory.liveStepSummary = normalizedDecision.stepSummary;
        session.memory.recoveryHint = undefined;
        appendLog(session, "runtime", "info", "任务结束。", {
          itemCount: session.memory.extractedItems.length,
          summary: normalizedDecision.action.summary,
        });
        this.recordStep(session, {
          stepSummary: normalizedDecision.stepSummary,
          nextIntent: normalizedDecision.nextIntent,
          expectedOutcome: normalizedDecision.expectedOutcome,
          action: normalizedDecision.action,
          snapshot: beforeSnapshot,
        });
        session.lastPublicState = toPublicState(session.memory);
        await broadcastUpdate(session.lastPublicState);
        return;
      }

      const result = await this.executeAction(session, normalizedDecision.action, normalizedDecision.stepSummary);
      throwIfStopped(session);
      await this.settleAfterAction(session, normalizedDecision.action);
      throwIfStopped(session);
      const afterSnapshot = await this.scanPage(session);
      throwIfStopped(session);

      const compareResult = compareExpectedOutcome(
        beforeSnapshot,
        afterSnapshot,
        normalizedDecision.expectedOutcome,
        normalizedDecision.action,
        result,
      );

      appendLog(session, "content", result.success ? "info" : "warn", `动作执行结果：${result.actionType}`, {
        message: result.message,
        errorCode: result.errorCode,
        observation: result.observation,
        itemCount: result.items?.length,
      });

      appendLog(session, "runtime", compareResult.matched ? "info" : "warn", "执行结果比对完成。", compareResult);

      if (result.items?.length) {
        session.memory.extractedItems = result.items;
      }

      session.memory.nextIntent = normalizedDecision.nextIntent;
      session.memory.runtimeMeta.currentStep += 1;
      session.memory.runtimeMeta.actionRetryCount = 0;
      session.memory.runtimeMeta.status = "observing";
      session.memory.liveStepSummary = normalizedDecision.stepSummary;
      session.memory.lastError =
        !compareResult.matched && normalizedDecision.action.type !== "SCROLL"
          ? compareResult.reason
          : undefined;
      this.recordStep(session, {
        stepSummary: normalizedDecision.stepSummary,
        nextIntent: normalizedDecision.nextIntent,
        expectedOutcome: normalizedDecision.expectedOutcome,
        action: normalizedDecision.action,
        actionResult: {
          ...result,
          message: `${result.message}；${compareResult.reason}`,
        },
        snapshot: afterSnapshot,
      });

      session.lastPublicState = toPublicState(session.memory);
      await broadcastUpdate(session.lastPublicState);

      const recovered = await this.maybeRecover(session, afterSnapshot, normalizedDecision.action, result, compareResult);
      if (recovered) {
        continue;
      }

      await sleep(400);
    }
  }

  private async getDecision(session: ActiveSession): Promise<LlmDecision> {
    session.memory.runtimeMeta.status = "planning";
    await this.pushState(session, "请求模型生成下一步动作。");

    try {
      const decision = await requestDecision(session.memory, { signal: session.abortController.signal });
      session.memory.runtimeMeta.llmRetryCount = 0;
      return decision;
    } catch (error) {
      if (error instanceof RuntimeError && error.code === "SESSION_STOPPED") {
        throw error;
      }

      session.memory.runtimeMeta.llmRetryCount += 1;
      if (session.memory.runtimeMeta.llmRetryCount >= LIMITS.MAX_LLM_RETRIES) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "模型决策失败。";
      appendLog(session, "llm", "warn", "模型决策失败，准备重试。", {
        retryCount: session.memory.runtimeMeta.llmRetryCount,
        message,
      });
      session.memory.lastError = message;
      return this.getDecision(session);
    }
  }

  private async scanPage(session: ActiveSession): Promise<SnapshotData> {
    session.memory.runtimeMeta.status = "scanning";
    await this.pushState(session, "扫描页面状态。");

    let lastError: unknown;
    for (let attempt = 0; attempt < LIMITS.SNAPSHOT_RETRIES; attempt += 1) {
      throwIfStopped(session);

      try {
        const response = await sendMessageToTab<SnapshotResponse>(session.memory.runtimeMeta.tabId, {
          type: "REQUEST_SNAPSHOT",
        });
        if (!response.ok || !response.snapshot) {
          throw new RuntimeError(response.error ?? "页面快照为空。", "SNAPSHOT_ERROR");
        }

        session.memory.pageSnapshot = response.snapshot;
        session.memory.runtimeMeta.pageType = response.snapshot.pageType;
        appendLog(session, "content", "info", "页面扫描完成。", {
          url: response.snapshot.url,
          title: response.snapshot.title,
          pageType: response.snapshot.pageType,
          ready: response.snapshot.pageReady,
          pageFacts: response.snapshot.pageFacts,
        });
        return response.snapshot;
      } catch (error) {
        lastError = error;
        appendLog(session, "content", "warn", "页面扫描失败，等待重试。", {
          attempt: attempt + 1,
          message: error instanceof Error ? error.message : "未知扫描错误",
        });
        await sleep(LIMITS.SNAPSHOT_RETRY_DELAY_MS);
      }
    }

    throw new RuntimeError(lastError instanceof Error ? lastError.message : "页面扫描失败。", "SNAPSHOT_FAILED");
  }

  private async ensurePageReady(session: ActiveSession, snapshot: SnapshotData): Promise<boolean> {
    if (snapshot.pageReady.ready) {
      session.memory.runtimeMeta.pageReadyRetryCount = 0;
      return true;
    }

    session.memory.runtimeMeta.pageReadyRetryCount += 1;
    session.memory.recoveryHint = snapshot.pageReady.reason;
    appendLog(session, "runtime", "warn", "页面尚未 ready。", snapshot.pageReady);

    if (session.memory.runtimeMeta.pageReadyRetryCount > LIMITS.PAGE_READY_RETRIES) {
      throw new RuntimeError(`页面持续未就绪：${snapshot.pageReady.reason}`, "PAGE_NOT_READY");
    }

    session.memory.liveStepSummary = `页面未就绪，等待稳定后重试。`;
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
    await sleep(LIMITS.PAGE_READY_WAIT_MS);
    return false;
  }

  private async executeAction(
    session: ActiveSession,
    action: AgentAction,
    stepSummary: string,
  ): Promise<ToolResult> {
    session.memory.runtimeMeta.status = "acting";
    await this.pushState(session, stepSummary);
    appendLog(session, "runtime", "info", "开始执行动作。", action);

    try {
      const response = await sendMessageToTab<ExecuteActionResponse>(session.memory.runtimeMeta.tabId, {
        type: "EXECUTE_ACTION",
        action,
      });
      if (!response.ok || !response.result) {
        throw new RuntimeError(response.error ?? "动作执行失败。", "ACTION_EXECUTION_ERROR");
      }
      return toolResultSchema.parse(response.result);
    } catch (error) {
      if (session.stopped) {
        throw new RuntimeError("任务已停止。", "SESSION_STOPPED");
      }

      session.memory.runtimeMeta.actionRetryCount += 1;
      if (session.memory.runtimeMeta.actionRetryCount > LIMITS.MAX_ACTION_RETRIES) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "动作执行失败。";
      appendLog(session, "runtime", "warn", "动作执行失败，准备重试。", {
        action,
        retryCount: session.memory.runtimeMeta.actionRetryCount,
        message,
      });
      session.memory.lastError = message;
      await sleep(500);
      return this.executeAction(session, action, stepSummary);
    }
  }

  private async settleAfterAction(session: ActiveSession, action: AgentAction) {
    const delayMs = getPostActionSettleDelay(action);
    const shouldWaitForTabLoad = action.type === "CLICK" || (action.type === "TYPE" && action.submit);

    if (delayMs <= 0 && !shouldWaitForTabLoad) {
      return;
    }

    session.memory.runtimeMeta.pageReadyRetryCount = 0;
    session.memory.liveStepSummary = delayMs > 0 ? `动作已完成，等待页面稳定（${delayMs}ms）。` : "动作已完成，等待页面稳定。";
    appendLog(session, "runtime", "info", "动作执行后等待页面稳定。", {
      actionType: action.type,
      delayMs,
      submit: action.type === "TYPE" ? !!action.submit : undefined,
    });
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    if (!shouldWaitForTabLoad) {
      return;
    }

    try {
      await waitForTabComplete(session.memory.runtimeMeta.tabId);
    } catch (error) {
      appendLog(session, "runtime", "warn", "等待页面加载完成失败，继续进入扫描阶段。", {
        actionType: action.type,
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  private async maybeRecover(
    session: ActiveSession,
    snapshot: SnapshotData,
    action: AgentAction,
    result: ToolResult,
    compareResult: { matched: boolean; reason: string },
  ) {
    if (!compareResult.matched && !snapshot.pageReady.ready) {
      session.memory.recoveryHint = snapshot.pageReady.reason;
      appendLog(session, "runtime", "warn", "观察结果未达预期，等待页面稳定。", snapshot.pageReady);
      await sleep(LIMITS.PAGE_READY_WAIT_MS);
      return true;
    }

    if (action.type !== "EXTRACT_LIST") {
      if (!compareResult.matched) {
        if (session.memory.runtimeMeta.recoveryCount >= LIMITS.MAX_RUNTIME_RECOVERY) {
          throw new RuntimeError("页面变化始终未达到预期，恢复次数已达上限。", "RECOVERY_EXHAUSTED");
        }

        session.memory.runtimeMeta.recoveryCount += 1;
        session.memory.recoveryHint = `页面变化未达预期，等待后重试（第 ${session.memory.runtimeMeta.recoveryCount} 次）。`;
        appendLog(session, "runtime", "warn", "普通动作未达到预期，进入等待恢复分支。", {
          recoveryCount: session.memory.runtimeMeta.recoveryCount,
          reason: compareResult.reason,
          action,
        });
        await sleep(LIMITS.PAGE_READY_WAIT_MS);
        return true;
      }

      session.memory.runtimeMeta.recoveryCount = 0;
      session.memory.recoveryHint = undefined;
      return false;
    }

    const extractedCount = result.items?.length ?? 0;
    if (extractedCount >= 3) {
      session.memory.runtimeMeta.recoveryCount = 0;
      session.memory.recoveryHint = undefined;
      return false;
    }

    const resultList = snapshot.pageFacts.resultList;
    if (!resultList) {
      return false;
    }

    if (!resultList.loaded) {
      session.memory.recoveryHint = "搜索结果仍在加载，等待后继续提取。";
      appendLog(session, "runtime", "warn", "搜索结果尚未加载完成，等待下一轮扫描。");
      await sleep(LIMITS.PAGE_READY_WAIT_MS);
      return true;
    }

    if (session.memory.runtimeMeta.recoveryCount >= LIMITS.MAX_RUNTIME_RECOVERY) {
      throw new RuntimeError("商品提取不足，且恢复次数已达上限。", "RECOVERY_EXHAUSTED");
    }

    const shouldScroll = resultList.cardCount > extractedCount || extractedCount === 0;
    if (!shouldScroll) {
      session.memory.recoveryHint = extractedCount > 0 ? `已提取 ${extractedCount} 个商品，但仍不足 3 个。` : compareResult.reason;
      return false;
    }

    session.memory.runtimeMeta.recoveryCount += 1;
    session.memory.runtimeMeta.lastRecoveryAction = "SCROLL";
    session.memory.recoveryHint = `提取结果不足，执行恢复动作：向下滚动加载更多结果（第 ${session.memory.runtimeMeta.recoveryCount} 次）。`;
    session.memory.lastError = undefined;
    appendLog(session, "runtime", "warn", "触发运行时恢复分支。", {
      recoveryCount: session.memory.runtimeMeta.recoveryCount,
      reason: compareResult.reason,
      resultList,
    });

    const recoverySummary = "提取结果不足，向下滚动加载更多结果。";
    const recoveryAction: AgentAction = { type: "SCROLL", direction: "down", amount: 920 };
    const recoveryResult = await this.executeAction(session, recoveryAction, recoverySummary);
    await this.settleAfterAction(session, recoveryAction);
    const recoverySnapshot = await this.scanPage(session);

    session.memory.runtimeMeta.currentStep += 1;
    session.memory.runtimeMeta.status = "observing";
    session.memory.liveStepSummary = recoverySummary;
    this.recordStep(session, {
      stepSummary: recoverySummary,
      nextIntent: "滚动后重新扫描并继续提取",
      expectedOutcome: "页面出现更多商品卡片",
      action: recoveryAction,
      actionResult: recoveryResult,
      snapshot: recoverySnapshot,
    });

    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
    return true;
  }

  private recordStep(
    session: ActiveSession,
    options: {
      stepSummary: string;
      nextIntent?: string;
      expectedOutcome?: string;
      action?: AgentAction;
      actionResult?: ToolResult;
      snapshot: SnapshotData;
    },
  ) {
    const record: StepRecord = {
      step: session.memory.stepHistory.length + 1,
      status: session.memory.runtimeMeta.status,
      stepSummary: options.stepSummary,
      nextIntent: options.nextIntent,
      expectedOutcome: options.expectedOutcome,
      action: options.action,
      actionResult: options.actionResult,
      snapshotSummary: summarizeSnapshot(options.snapshot),
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
