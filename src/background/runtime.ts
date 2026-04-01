import { DEFAULT_PLAN, LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type { ExecuteActionResponse, RequestSnapshotMessage, SnapshotResponse, StartSessionResponse } from "../shared/protocol";
import { toolResultSchema } from "../shared/schema";
import type {
  AgentAction,
  DebugLogEntry,
  DebugLogLevel,
  ExtractedItem,
  SessionMemory,
  SessionPublicState,
  SnapshotData,
  StepRecord,
  ToolResult,
} from "../shared/types";
import { summarizeSnapshot } from "./guards";
import { generateFinalSummary, refineSearchQuery } from "./llm-client";
import { compileSearchTask } from "./query-compiler";
import { filterExtractedItems } from "./result-filter";

const JD_HOME_URL = "https://www.jd.com/";
const NAVIGATION_TIMEOUT_MS = 20_000;
const MAX_LOG_ENTRIES = 80;
const TIMELINE_LIMIT = 8;
const POST_ACTION_SETTLE_MS = {
  navigateLike: LIMITS.PAGE_READY_WAIT_MS,
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
    taskSpec: memory.taskSpec,
    status: memory.runtimeMeta.status,
    currentStep: memory.runtimeMeta.currentStep,
    plan: memory.plan,
    stepSummary: memory.liveStepSummary ?? lastStep?.stepSummary,
    lastAction: lastStep?.action,
    lastActionResult: lastStep?.actionResult,
    items: memory.extractedItems,
    rawItemCount: memory.rawExtractedItems.length,
    filterDiagnostics: memory.filterDiagnostics,
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

  if (action.type === "CLICK" || (action.type === "TYPE" && action.submit)) {
    return POST_ACTION_SETTLE_MS.navigateLike;
  }

  return 0;
}

function normalizeText(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function hasMatchingQuery(snapshot: SnapshotData, searchQuery: string) {
  return normalizeText(snapshot.pageFacts.searchBox.text).includes(normalizeText(searchQuery));
}

function buildFallbackSummary(goal: string, items: ExtractedItem[]) {
  const first = items[0];
  if (!first) {
    return `已完成目标“${goal}”的搜索，但没有拿到足够可用的商品结果。`;
  }

  const priceList = items.map((item) => item.priceText).join(" / ");
  return `已根据“${goal}”筛出 ${items.length} 个候选商品。当前首个推荐是 ${first.title}，价格参考为 ${first.priceText}，其余候选价格依次为 ${priceList}。`;
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
      plan: [...DEFAULT_PLAN],
      stepHistory: [],
      logs: [],
      rawExtractedItems: [],
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
        queryRefineTried: false,
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
    await this.prepareTask(session);

    while (!session.stopped) {
      throwIfStopped(session);

      if (session.memory.runtimeMeta.currentStep >= LIMITS.MAX_STEPS) {
        throw new RuntimeError("超过最大执行步数限制。", "MAX_STEPS_REACHED");
      }

      const snapshot = await this.ensureUsableSnapshot(session);
      throwIfStopped(session);

      if (!session.memory.taskSpec) {
        throw new RuntimeError("结构化任务不存在。", "TASK_SPEC_MISSING");
      }

      if (snapshot.pageType === "home" || !hasMatchingQuery(snapshot, session.memory.taskSpec.searchQuery)) {
        await this.performSearch(session, session.memory.taskSpec.searchQuery);
        continue;
      }

      if (snapshot.pageType !== "search") {
        throw new RuntimeError(`当前页面类型不支持继续执行：${snapshot.pageType}`, "UNSUPPORTED_PAGE");
      }

      const completed = await this.extractFilterAndFinalize(session, snapshot);
      if (completed) {
        return;
      }
    }
  }

  private async prepareTask(session: ActiveSession) {
    session.memory.runtimeMeta.status = "planning";
    session.memory.liveStepSummary = "解析任务并生成搜索词。";
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);

    const taskSpec = await compileSearchTask(session.memory.goal, {
      refineWithLiteModel: async (goal, draftQuery) => {
        session.memory.runtimeMeta.queryRefineTried = true;
        const refined = await refineSearchQuery(goal, draftQuery, { signal: session.abortController.signal });
        appendLog(session, "llm", "info", "已使用轻量模型补全搜索词。", {
          model: refined.model,
          draftQuery,
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        });
        return {
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        };
      },
    });

    session.memory.taskSpec = taskSpec;
    session.memory.nextIntent = "提交搜索词并进入搜索结果页";
    this.recordStep(session, {
      stepSummary: "已完成任务解析与搜索词编译。",
      nextIntent: session.memory.nextIntent,
      expectedOutcome: "获得稳定的站内搜索词",
      snapshotSummary: `${taskSpec.searchQuery} | ${taskSpec.querySource}`,
    });

    appendLog(session, "runtime", "info", "结构化任务已生成。", taskSpec);
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
  }

  private async ensureUsableSnapshot(session: ActiveSession) {
    let snapshot = await this.scanPage(session);
    if (snapshot.pageReady.ready) {
      return snapshot;
    }

    appendLog(session, "runtime", "warn", "页面暂未达到可用状态，进入短等待。", snapshot.pageReady);
    session.memory.recoveryHint = snapshot.pageReady.reason;
    session.memory.liveStepSummary = "页面暂未可用，等待后重试。";
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);

    await sleep(LIMITS.PAGE_READY_WAIT_MS);
    snapshot = await this.scanPage(session);
    if (snapshot.pageReady.ready) {
      session.memory.recoveryHint = undefined;
      return snapshot;
    }

    appendLog(session, "runtime", "warn", "页面仍未可用，进入最后一次短重试。", snapshot.pageReady);
    await sleep(LIMITS.PAGE_READY_SECOND_WAIT_MS);
    snapshot = await this.scanPage(session);
    if (snapshot.pageReady.ready) {
      session.memory.recoveryHint = undefined;
      return snapshot;
    }

    throw new RuntimeError(`页面持续未就绪：${snapshot.pageReady.reason}`, "PAGE_NOT_READY");
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
          pageReady: response.snapshot.pageReady,
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

  private async performSearch(session: ActiveSession, searchQuery: string) {
    const snapshotBefore = session.memory.pageSnapshot;
    const action: AgentAction = {
      type: "TYPE",
      agentId: "el_search_input",
      text: searchQuery,
      submit: true,
    };

    const result = await this.executeAction(session, action, `提交搜索词：${searchQuery}`);
    await this.settleAfterAction(session, action);
    const snapshotAfter = await this.scanPage(session);

    session.memory.rawExtractedItems = [];
    session.memory.extractedItems = [];
    session.memory.filterDiagnostics = undefined;
    session.memory.nextIntent = "进入搜索结果页并提取商品";
    session.memory.recoveryHint = undefined;
    session.memory.lastError = result.success ? undefined : result.message;
    session.memory.runtimeMeta.recoveryCount = 0;
    session.memory.runtimeMeta.currentStep += 1;
    this.recordStep(session, {
      stepSummary: `已提交搜索词：${searchQuery}`,
      nextIntent: session.memory.nextIntent,
      expectedOutcome: "页面跳转到搜索结果页",
      action,
      actionResult: result,
      snapshot: snapshotAfter,
    });

    appendLog(session, "runtime", "info", "已执行规则化搜索动作。", {
      fromPage: snapshotBefore?.pageType,
      toPage: snapshotAfter.pageType,
      searchQuery,
      resultMessage: result.message,
    });

    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
  }

  private async extractFilterAndFinalize(session: ActiveSession, snapshot: SnapshotData) {
    const extractAction: AgentAction = { type: "EXTRACT_LIST" };
    const extractResult = await this.executeAction(session, extractAction, "提取搜索结果列表。");
    const afterExtractSnapshot = await this.scanPage(session);

    session.memory.runtimeMeta.currentStep += 1;
    session.memory.rawExtractedItems = extractResult.items ?? [];
    session.memory.lastError = extractResult.success ? undefined : extractResult.message;
    this.recordStep(session, {
      stepSummary: "已执行商品提取。",
      nextIntent: "过滤候选商品并判断是否足够生成推荐",
      expectedOutcome: "拿到至少 3 个候选商品",
      action: extractAction,
      actionResult: extractResult,
      snapshot: afterExtractSnapshot,
    });

    appendLog(session, "content", extractResult.success ? "info" : "warn", "提取工具执行完成。", {
      message: extractResult.message,
      itemCount: extractResult.items?.length ?? 0,
      observation: extractResult.observation,
    });

    if (!extractResult.items?.length) {
      return this.maybeRecoverByScroll(session, afterExtractSnapshot, "当前提取结果为空。");
    }

    if (!session.memory.taskSpec) {
      throw new RuntimeError("结构化任务不存在。", "TASK_SPEC_MISSING");
    }

    const filtered = filterExtractedItems(extractResult.items, session.memory.taskSpec);
    session.memory.filterDiagnostics = filtered.diagnostics;
    session.memory.extractedItems = filtered.items;
    session.memory.lastError = undefined;
    session.memory.recoveryHint = undefined;
    this.recordStep(session, {
      stepSummary: "已完成候选商品过滤。",
      nextIntent: "判断结果数量是否满足最终总结条件",
      expectedOutcome: "获得预算内且去重后的候选列表",
      snapshotSummary: JSON.stringify(filtered.diagnostics),
    });

    appendLog(session, "runtime", "info", "结果过滤完成。", {
      rawCount: extractResult.items.length,
      filterDiagnostics: filtered.diagnostics,
    });

    const requiredCount = Math.max(3, session.memory.taskSpec.topK);
    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);

    if (filtered.items.length >= requiredCount) {
      await this.finalize(session);
      return true;
    }

    return this.maybeRecoverByScroll(
      session,
      afterExtractSnapshot,
      `过滤后只有 ${filtered.items.length} 个候选商品，未达到 ${requiredCount} 个。`,
    );
  }

  private async maybeRecoverByScroll(session: ActiveSession, snapshot: SnapshotData, reason: string) {
    const resultList = snapshot.pageFacts.resultList;
    if (!resultList?.present || resultList.emptyState) {
      throw new RuntimeError(reason, "NO_RECOVERABLE_RESULTS");
    }

    if (session.memory.runtimeMeta.recoveryCount >= LIMITS.MAX_RUNTIME_RECOVERY) {
      throw new RuntimeError(`${reason}，且恢复次数已达上限。`, "RECOVERY_EXHAUSTED");
    }

    session.memory.runtimeMeta.recoveryCount += 1;
    session.memory.runtimeMeta.lastRecoveryAction = "SCROLL";
    session.memory.recoveryHint = `当前结果不足，执行第 ${session.memory.runtimeMeta.recoveryCount} 次滚动恢复。`;
    appendLog(session, "runtime", "warn", "触发运行时恢复分支。", {
      reason,
      recoveryCount: session.memory.runtimeMeta.recoveryCount,
      resultList,
    });

    const action: AgentAction = { type: "SCROLL", direction: "down", amount: 920 };
    const result = await this.executeAction(session, action, "结果不足，向下滚动加载更多商品。");
    await this.settleAfterAction(session, action);
    const snapshotAfter = await this.scanPage(session);

    session.memory.runtimeMeta.currentStep += 1;
    this.recordStep(session, {
      stepSummary: "已执行滚动恢复。",
      nextIntent: "重新提取搜索结果",
      expectedOutcome: "页面出现更多商品卡片",
      action,
      actionResult: result,
      snapshot: snapshotAfter,
    });

    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
    return false;
  }

  private async finalize(session: ActiveSession) {
    if (!session.memory.taskSpec || session.memory.extractedItems.length === 0) {
      throw new RuntimeError("没有足够的结果可用于生成总结。", "FINALIZE_BLOCKED");
    }

    let summary = "";
    try {
      const response = await generateFinalSummary(
        session.memory.goal,
        session.memory.taskSpec,
        session.memory.extractedItems,
        { signal: session.abortController.signal },
      );
      summary = response.summary;
      appendLog(session, "llm", "info", "已生成最终推荐总结。", {
        model: response.model,
        itemCount: session.memory.extractedItems.length,
      });
    } catch (error) {
      summary = buildFallbackSummary(session.memory.goal, session.memory.extractedItems);
      appendLog(session, "llm", "warn", "最终总结生成失败，已回退到规则摘要。", {
        message: error instanceof Error ? error.message : "未知错误",
      });
    }

    session.memory.finalSummary = summary;
    session.memory.runtimeMeta.status = "done";
    session.memory.runtimeMeta.currentStep += 1;
    session.memory.liveStepSummary = "任务完成，已生成最终推荐。";
    session.memory.recoveryHint = undefined;
    session.memory.lastError = undefined;

    this.recordStep(session, {
      stepSummary: "已完成最终推荐总结。",
      nextIntent: "结束任务",
      expectedOutcome: "输出最终推荐说明",
      snapshotSummary: `${session.memory.extractedItems.length} items -> final summary`,
      action: {
        type: "DONE",
        summary,
        items: session.memory.extractedItems,
      },
    });

    session.lastPublicState = toPublicState(session.memory);
    await broadcastUpdate(session.lastPublicState);
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
      session.memory.runtimeMeta.actionRetryCount = 0;
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
      await sleep(300);
      return this.executeAction(session, action, stepSummary);
    }
  }

  private async settleAfterAction(session: ActiveSession, action: AgentAction) {
    const delayMs = getPostActionSettleDelay(action);
    const shouldWaitForTabLoad = action.type === "CLICK" || (action.type === "TYPE" && action.submit);

    if (delayMs <= 0 && !shouldWaitForTabLoad) {
      return;
    }

    appendLog(session, "runtime", "info", "动作执行后等待页面稳定。", {
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
      appendLog(session, "runtime", "warn", "等待页面加载完成失败，继续进入下一轮扫描。", {
        actionType: action.type,
        message: error instanceof Error ? error.message : "未知错误",
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
