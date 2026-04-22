import type {
  BrowserActionResult,
  BrowserClickInput,
  BrowserControlObservation,
  BrowserEvaluateInput,
  BrowserEvaluateResult,
  BrowserLinkObservation,
  BrowserNavigateInput,
  BrowserObservation,
  BrowserOpenTabInput,
  BrowserOperationOptions,
  BrowserPressInput,
  BrowserRiskLevel,
  BrowserScreenshot,
  BrowserScreenshotInput,
  BrowserScrollInput,
  BrowserTabRef,
  BrowserTargetRef,
  BrowserTypeInput,
} from "../../../shared/browser-capability";
import type { ActionResult, AgentAction, InteractiveElement, SnapshotData } from "../../../shared/types";
import type { BrowserDriver } from "../../../background/browser-capability/types";
import type { ExecuteActionResponse, SnapshotResponse } from "../../../shared/protocol";
import { createBrowserCoreProblem } from "../../shared/page-problems";
import { sendMessageToTab, waitForTabComplete } from "../../../background/runtime/tab-host";

interface RuntimeBrowserDriverCallbacks {
  onTabChanged?(tabId: number): void;
  onSnapshot?(snapshot: SnapshotData): void;
}

function throwIfAborted(options?: BrowserOperationOptions) {
  if (options?.signal?.aborted) {
    throw new Error("Browser Core V2 runtime driver was aborted.");
  }
}

function normalizeTabStatus(status: string | undefined): BrowserTabRef["status"] {
  if (status === "loading" || status === "complete" || status === "unloaded") {
    return status;
  }
  return "unknown";
}

function toTabRef(tab: chrome.tabs.Tab): BrowserTabRef {
  return {
    tabId: tab.id!,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title,
    active: !!tab.active,
    status: normalizeTabStatus(tab.status),
  };
}

function toTargetRef(tabId: number, element: InteractiveElement): BrowserTargetRef {
  const role =
    element.role === "input" || element.role === "button" || element.role === "link"
      ? element.role
      : "unknown";
  return {
    tabId,
    refId: element.agentId,
    role,
    name: element.text || element.agentId,
    text: element.text || undefined,
    bounds: element.rect,
    source: "content_script",
  };
}

function toControls(tabId: number, elements: InteractiveElement[]): BrowserControlObservation[] {
  return elements
    .filter((element) => element.role === "input" || element.role === "button")
    .map((element) => ({
      targetRef: toTargetRef(tabId, element),
      disabled: !element.isVisible,
    }));
}

function toProblems(snapshot: SnapshotData, detailResult?: ActionResult): BrowserObservation["problems"] {
  const problems = [];

  if (!snapshot.pageReady.ready) {
    problems.push(
      createBrowserCoreProblem("operation_failed", snapshot.pageReady.reason, {
        recoverable: true,
        suggestedNextAction: "Wait briefly and retry the page observation.",
      }),
    );
  }

  const pageContent = snapshot.pageFacts.pageContent;
  if (pageContent?.hasBlockingOverlay) {
    problems.push(
      createBrowserCoreProblem("blocking_overlay", "A blocking overlay may be hiding the page content.", {
        recoverable: true,
        suggestedNextAction: "Retry after dismissing the dialog or overlay.",
      }),
    );
  }
  if (pageContent?.likelyLoginWall) {
    problems.push(
      createBrowserCoreProblem("login_wall", pageContent.reason || "The page appears to require login.", {
        recoverable: false,
      }),
    );
  }

  if (detailResult?.pageFactsResult?.status === "partial") {
    problems.push(
      createBrowserCoreProblem("empty_content", detailResult.pageFactsResult.reason || "Readable page content was partial.", {
        recoverable: true,
        suggestedNextAction: "Try a higher-value page or run a same-site overview.",
      }),
    );
  }

  return problems;
}

async function requestSnapshot(tabId: number): Promise<SnapshotData> {
  const response = await sendMessageToTab<SnapshotResponse>(tabId, {
    type: "REQUEST_SNAPSHOT",
  });

  if (!response.ok || !response.snapshot) {
    throw new Error(response.error ?? `Snapshot request failed for tab ${tabId}.`);
  }

  return response.snapshot;
}

async function runTabAction(tabId: number, action: AgentAction): Promise<ActionResult> {
  const response = await sendMessageToTab<ExecuteActionResponse>(tabId, {
    type: "EXECUTE_ACTION",
    action,
  });
  if (!response.ok || !response.result) {
    throw new Error(response.error ?? `Action ${action.type} failed for tab ${tabId}.`);
  }
  return response.result;
}

function toSearchLinks(actionResult: ActionResult): BrowserLinkObservation[] {
  return (actionResult.researchCandidates ?? []).map((candidate) => ({
    text: candidate.title,
    url: candidate.url,
  }));
}

function toNavLinks(actionResult: ActionResult): BrowserLinkObservation[] {
  return (actionResult.researchCandidates ?? []).map((candidate) => ({
    text: candidate.linkText || candidate.title,
    url: candidate.url,
  }));
}

function toObservationCoverage(snapshot: SnapshotData, links: BrowserLinkObservation[], controls: BrowserControlObservation[]) {
  return {
    mainTextChars: snapshot.pageFacts.pageContent?.textLength ?? 0,
    linkCount: links.length,
    controlCount: controls.length,
    targetCount: snapshot.interactiveElements.length,
  };
}

function toActionStatus(success: boolean): BrowserActionResult["status"] {
  return success ? "success" : "failed";
}

function toBrowserActionResult(message: string, actionResult?: ActionResult): BrowserActionResult {
  return {
    status: toActionStatus(actionResult?.success ?? true),
    message,
    problems: [],
    navigated: actionResult?.navigated,
  };
}

function blockedRisk(riskLevel: BrowserRiskLevel | undefined) {
  return riskLevel === "medium_risk_submit" || riskLevel === "high_risk_irreversible";
}

export class RuntimeBrowserDriver implements BrowserDriver {
  constructor(private readonly callbacks: RuntimeBrowserDriverCallbacks = {}) {}

  async listTabs(options?: BrowserOperationOptions): Promise<BrowserTabRef[]> {
    throwIfAborted(options);
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.filter((tab) => tab.id).map(toTabRef);
  }

  async openTab(input: BrowserOpenTabInput, options?: BrowserOperationOptions): Promise<BrowserTabRef> {
    throwIfAborted(options);
    const tab = await chrome.tabs.create({
      url: input.url,
      active: input.active ?? true,
    });
    if (!tab.id) {
      throw new Error("Failed to open a browser tab.");
    }
    this.callbacks.onTabChanged?.(tab.id);
    return toTabRef(tab);
  }

  async closeTab(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    await chrome.tabs.remove(tabId);
    return {
      status: "success",
      message: `Closed tab ${tabId}.`,
      problems: [],
    };
  }

  async focusTab(tabId: number, options?: BrowserOperationOptions): Promise<BrowserTabRef> {
    throwIfAborted(options);
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (!tab?.id) {
      throw new Error(`Failed to focus tab ${tabId}.`);
    }
    this.callbacks.onTabChanged?.(tab.id);
    return toTabRef(tab);
  }

  async navigate(tabId: number, input: BrowserNavigateInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    const tab = await chrome.tabs.update(tabId, {
      url: input.url,
      active: input.active,
    });
    if (!tab?.id) {
      throw new Error(`Failed to navigate tab ${tabId}.`);
    }
    this.callbacks.onTabChanged?.(tab.id);
    return {
      status: "success",
      message: `Navigated to ${input.url}.`,
      problems: [],
      navigated: true,
    };
  }

  async reload(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    await chrome.tabs.reload(tabId);
    this.callbacks.onTabChanged?.(tabId);
    return {
      status: "success",
      message: `Reloaded tab ${tabId}.`,
      problems: [],
      navigated: true,
    };
  }

  async waitForStable(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    await waitForTabComplete(tabId);
    return {
      status: "success",
      message: `Tab ${tabId} is stable.`,
      problems: [],
    };
  }

  async observe(tabId: number, options?: BrowserOperationOptions): Promise<BrowserObservation> {
    throwIfAborted(options);

    const snapshot = await requestSnapshot(tabId);
    this.callbacks.onSnapshot?.(snapshot);
    this.callbacks.onTabChanged?.(tabId);

    let detailResult: ActionResult | undefined;
    let links: BrowserLinkObservation[] = [];

    if (snapshot.pageType === "google_search") {
      links = toSearchLinks(await runTabAction(tabId, { type: "EXTRACT_SEARCH_RESULTS", limit: 10 }));
    } else {
      detailResult = await runTabAction(tabId, { type: "EXTRACT_PAGE_FACTS" });
      const navResult = await runTabAction(tabId, { type: "EXTRACT_SITE_NAV_LINKS", limit: 20, baseUrl: snapshot.url });
      links = toNavLinks(navResult);
    }

    const tab = await chrome.tabs.get(tabId);
    const targets = snapshot.interactiveElements.map((element) => toTargetRef(tabId, element));
    const controls = toControls(tabId, snapshot.interactiveElements);
    const mainText =
      detailResult?.pageFactsResult?.bodyExcerpt ??
      (snapshot.pageType === "google_search"
        ? links.map((link) => link.text).join("\n")
        : "");

    return {
      tab: toTabRef(tab),
      url: snapshot.url,
      title: snapshot.title,
      mainText,
      links,
      controls,
      semanticSnapshot: snapshot.semanticSnapshot,
      targets,
      problems: toProblems(snapshot, detailResult),
      truncated: snapshot.semanticSnapshot?.truncated ?? false,
      coverage: toObservationCoverage(snapshot, links, controls),
    };
  }

  async screenshot(_tabId: number, input?: BrowserScreenshotInput, options?: BrowserOperationOptions): Promise<BrowserScreenshot> {
    throwIfAborted(options);
    return {
      mimeType: "image/png",
      base64: "",
      width: 0,
      height: 0,
      fullPage: input?.fullPage ?? false,
      sanitized: false,
      problems: [
        createBrowserCoreProblem("screenshot_failed", "Runtime BrowserDriver does not support screenshots yet.", {
          recoverable: true,
        }),
      ],
    };
  }

  async click(tabId: number, input: BrowserClickInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    if (blockedRisk(input.riskLevel)) {
      return {
        status: "blocked",
        message: "High-risk click actions are blocked in the runtime BrowserDriver.",
        problems: [createBrowserCoreProblem("operation_failed", "High-risk click action was blocked.", { recoverable: false })],
      };
    }
    const result = await runTabAction(tabId, { type: "CLICK", agentId: input.targetRef.refId });
    return toBrowserActionResult(result.message, result);
  }

  async type(tabId: number, input: BrowserTypeInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    if (blockedRisk(input.riskLevel)) {
      return {
        status: "blocked",
        message: "High-risk type actions are blocked in the runtime BrowserDriver.",
        problems: [createBrowserCoreProblem("operation_failed", "High-risk type action was blocked.", { recoverable: false })],
      };
    }
    const result = await runTabAction(tabId, {
      type: "TYPE",
      agentId: input.targetRef.refId,
      text: input.text,
      submit: input.submit,
    });
    return toBrowserActionResult(result.message, result);
  }

  async press(tabId: number, input: BrowserPressInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    if (blockedRisk(input.riskLevel)) {
      return {
        status: "blocked",
        message: "High-risk press actions are blocked in the runtime BrowserDriver.",
        problems: [createBrowserCoreProblem("operation_failed", "High-risk press action was blocked.", { recoverable: false })],
      };
    }
    const result = await runTabAction(tabId, {
      type: "TYPE",
      agentId: input.targetRef?.refId ?? "el_search_input",
      text: input.key,
      submit: false,
    });
    return toBrowserActionResult(result.message, result);
  }

  async scroll(tabId: number, input: BrowserScrollInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    throwIfAborted(options);
    const result = await runTabAction(tabId, {
      type: "SCROLL",
      direction: input.direction,
      amount: input.amount,
    });
    return toBrowserActionResult(result.message, result);
  }

  async evaluateLimited(_tabId: number, _input: BrowserEvaluateInput, options?: BrowserOperationOptions): Promise<BrowserEvaluateResult> {
    throwIfAborted(options);
    return {
      status: "blocked",
      message: "Runtime BrowserDriver does not expose evaluateLimited.",
      problems: [
        createBrowserCoreProblem("evaluate_blocked", "Raw evaluate is blocked in the runtime BrowserDriver.", {
          recoverable: false,
        }),
      ],
    };
  }
}

export function createRuntimeBrowserDriver(callbacks?: RuntimeBrowserDriverCallbacks) {
  return new RuntimeBrowserDriver(callbacks);
}
