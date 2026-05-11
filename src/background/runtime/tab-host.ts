import { LIMITS } from "../../shared/agent-runtime-config";
import { RuntimeError } from "../../shared/runtime-error";
import type { ExecuteActionResponse, RequestSnapshotMessage, SnapshotResponse } from "../../shared/extension-message-protocol";
import { actionResultSchema } from "../../shared/llm-runtime-contract-schemas";
import type { ActionResult, AgentAction, SnapshotData, TaskType } from "../../shared/agent-domain-model";
import { summarizeSnapshot } from "../runtime-action-guards";
import type { ActiveSession } from "./runtime-session-state";
import { appendLog, sleep, throwIfStopped } from "./runtime-session-state";

const JD_HOME_URL = "https://www.jd.com/";
const GOOGLE_HOME_URL = "https://www.google.com/";
const NAVIGATION_TIMEOUT_MS = 20_000;
const POST_ACTION_SETTLE_MS = {
  navigateLike: 1_000,
  scroll: 400,
} as const;

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

export async function waitForTabComplete(tabId: number, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<chrome.tabs.Tab> {
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

export async function getOrPrepareSessionTab(taskType: TaskType): Promise<{ tab: chrome.tabs.Tab; navigatedToHome: boolean; fromUrl?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new RuntimeError("No active tab is available.", "NO_ACTIVE_TAB");
  }

  if (taskType === "direct_answer") {
    const readyTab = tab.status === "complete" ? tab : await waitForTabComplete(tab.id);
    return { tab: readyTab, navigatedToHome: false, fromUrl: tab.url ?? undefined };
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
    func: async (
      bridgeUrl: string,
      request: RequestSnapshotMessage | { type: "EXECUTE_ACTION"; action: AgentAction },
    ) => {
      await import(bridgeUrl);
      const bridge = (globalThis as typeof globalThis & {
        __browserAgentMvpDirectBridge?: {
          scanCurrentPage: () => SnapshotData;
          executeCurrentAction: (action: AgentAction) => Promise<ActionResult>;
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

export async function scanSessionPage(
  session: ActiveSession,
  options: {
    pushState(stepSummary?: string): Promise<void>;
  },
): Promise<SnapshotData> {
  await options.pushState("Scan the current page state.");

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
        snapshotSummary: summarizeSnapshot(response.snapshot),
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

export async function executeSessionAction(
  session: ActiveSession,
  action: AgentAction,
  stepSummary: string,
  options: {
    pushState(stepSummary?: string): Promise<void>;
  },
): Promise<ActionResult> {
  await options.pushState(stepSummary);
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
    return actionResultSchema.parse(response.result);
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
    return executeSessionAction(session, action, stepSummary, options);
  }
}

function getPostActionSettleDelay(action: AgentAction) {
  if (action.type === "SCROLL" || action.type === "RECOVER_CLOSE_DIALOG") {
    return POST_ACTION_SETTLE_MS.scroll;
  }

  if (action.type === "CLICK" || action.type === "NAVIGATE" || (action.type === "TYPE" && action.submit)) {
    return POST_ACTION_SETTLE_MS.navigateLike;
  }

  return 0;
}

export async function settleSessionAfterAction(session: ActiveSession, action: AgentAction) {
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

export async function ensureSessionUsableSnapshot(
  session: ActiveSession,
  options: {
    scanPage(): Promise<SnapshotData>;
    publishState(): Promise<void>;
  },
) {
  let snapshot = await options.scanPage();
  if (snapshot.pageReady.ready) {
    session.memory.runtimeMeta.pageWaitRecoveryCount = 0;
    return snapshot;
  }

  appendLog(session, "runtime", "warn", "Page is not ready yet; entering short wait.", snapshot.pageReady);
  session.memory.runtimeMeta.pageWaitRecoveryCount = 1;
  session.memory.recoveryHint = `${snapshot.pageReady.reason} (wait recovery 1/2)`;
  session.memory.liveStepSummary = "Waiting for the page to become usable.";
  await options.publishState();

  await sleep(LIMITS.PAGE_READY_WAIT_MS);
  snapshot = await options.scanPage();
  if (snapshot.pageReady.ready) {
    session.memory.runtimeMeta.pageWaitRecoveryCount = 0;
    session.memory.recoveryHint = undefined;
    return snapshot;
  }

  appendLog(session, "runtime", "warn", "Page is still not ready; running one last short retry.", snapshot.pageReady);
  session.memory.runtimeMeta.pageWaitRecoveryCount = 2;
  session.memory.recoveryHint = `${snapshot.pageReady.reason} (wait recovery 2/2)`;
  await sleep(LIMITS.PAGE_READY_SECOND_WAIT_MS);
  snapshot = await options.scanPage();
  if (snapshot.pageReady.ready) {
    session.memory.runtimeMeta.pageWaitRecoveryCount = 0;
    session.memory.recoveryHint = undefined;
    return snapshot;
  }

  throw new RuntimeError(`Page stayed unusable: ${snapshot.pageReady.reason}`, "PAGE_NOT_READY");
}
