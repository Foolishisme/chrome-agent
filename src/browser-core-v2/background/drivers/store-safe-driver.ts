import { createBrowserCoreProblem } from "../../shared/page-problems";
import type {
  BrowserActionResult,
  BrowserClickInput,
  BrowserEvaluateInput,
  BrowserEvaluateResult,
  BrowserNavigateInput,
  BrowserObservation,
  BrowserOpenTabInput,
  BrowserOperationOptions,
  BrowserPressInput,
  BrowserScreenshot,
  BrowserScreenshotInput,
  BrowserScrollInput,
  BrowserTabRef,
  BrowserTypeInput,
} from "../../../shared/browser-capability";
import type { BrowserDriver } from "../../../background/browser-capability/types";
import type { BrowserCoreV2ContentScriptClient } from "./content-script-client";

export interface BrowserCoreV2TabClient {
  listTabs(): Promise<BrowserTabRef[]>;
  openTab(input: BrowserOpenTabInput): Promise<BrowserTabRef>;
  closeTab(tabId: number): Promise<BrowserActionResult>;
  focusTab(tabId: number): Promise<BrowserTabRef>;
  navigate(tabId: number, input: BrowserNavigateInput): Promise<BrowserActionResult>;
  reload(tabId: number): Promise<BrowserActionResult>;
  waitForStable(tabId: number): Promise<BrowserActionResult>;
}

function throwIfAborted(options?: BrowserOperationOptions) {
  if (options?.signal?.aborted) {
    throw new Error("Browser Core V2 operation was aborted.");
  }
}

function blockedEvaluate(): BrowserEvaluateResult {
  const problem = createBrowserCoreProblem("evaluate_blocked", "Browser Core V2 store-safe driver does not expose raw evaluate.", {
    recoverable: true,
    suggestedNextAction: "Use observe, read, extractLinksAndControls, or a purpose-built browser action.",
  });
  return {
    status: "blocked",
    message: problem.message,
    problems: [problem],
    suggestedNextAction: problem.suggestedNextAction,
  };
}

function unsupportedScreenshot(input?: BrowserScreenshotInput): BrowserScreenshot {
  return {
    mimeType: "image/png",
    base64: "",
    width: 0,
    height: 0,
    fullPage: input?.fullPage ?? false,
    sanitized: false,
    problems: [
      createBrowserCoreProblem("screenshot_failed", "Store-safe screenshot capture is not wired in Browser Core V2 yet.", {
        recoverable: true,
        suggestedNextAction: "Use DOM observation and readable content until screenshot support is wired.",
      }),
    ],
  };
}

export class StoreSafeDriver implements BrowserDriver {
  constructor(
    private readonly tabs: BrowserCoreV2TabClient,
    private readonly content: BrowserCoreV2ContentScriptClient,
  ) {}

  async listTabs(options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.listTabs();
  }

  async openTab(input: BrowserOpenTabInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.openTab(input);
  }

  async closeTab(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.closeTab(tabId);
  }

  async focusTab(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.focusTab(tabId);
  }

  async navigate(tabId: number, input: BrowserNavigateInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.navigate(tabId, input);
  }

  async reload(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.reload(tabId);
  }

  async waitForStable(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.tabs.waitForStable(tabId);
  }

  async observe(tabId: number, options?: BrowserOperationOptions): Promise<BrowserObservation> {
    throwIfAborted(options);
    return this.content.observe(tabId);
  }

  async screenshot(_tabId: number, input?: BrowserScreenshotInput, options?: BrowserOperationOptions): Promise<BrowserScreenshot> {
    throwIfAborted(options);
    return unsupportedScreenshot(input);
  }

  async click(tabId: number, input: BrowserClickInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.content.click(tabId, input);
  }

  async type(tabId: number, input: BrowserTypeInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.content.type(tabId, input);
  }

  async press(tabId: number, input: BrowserPressInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.content.press(tabId, input);
  }

  async scroll(tabId: number, input: BrowserScrollInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.content.scroll(tabId, input);
  }

  async evaluateLimited(_tabId: number, _input: BrowserEvaluateInput, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return blockedEvaluate();
  }
}
