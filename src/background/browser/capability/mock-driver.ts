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
import type { BrowserDriver } from "./types";

type BrowserDriverMethod = keyof BrowserDriver;

interface MockActionResults {
  closeTab?: BrowserActionResult;
  navigate?: BrowserActionResult;
  reload?: BrowserActionResult;
  waitForStable?: BrowserActionResult;
  click?: BrowserActionResult;
  type?: BrowserActionResult;
  press?: BrowserActionResult;
  scroll?: BrowserActionResult;
  evaluateLimited?: BrowserEvaluateResult;
}

export interface MockBrowserDriverOptions {
  tabs?: BrowserTabRef[];
  observations?: Record<number, BrowserObservation>;
  screenshots?: Record<number, BrowserScreenshot>;
  actionResults?: MockActionResults;
  failures?: Partial<Record<BrowserDriverMethod, Error | string>>;
}

function defaultAction(message: string, extra: Partial<BrowserActionResult> = {}): BrowserActionResult {
  return {
    status: "success",
    message,
    problems: [],
    ...extra,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function ensureNotAborted(options?: BrowserOperationOptions) {
  if (options?.signal?.aborted) {
    throw new Error("Browser operation was aborted.");
  }
}

function throwFailure(method: BrowserDriverMethod, failures: Partial<Record<BrowserDriverMethod, Error | string>>) {
  const failure = failures[method];
  if (!failure) {
    return;
  }
  throw failure instanceof Error ? failure : new Error(failure);
}

export class MockBrowserDriver implements BrowserDriver {
  readonly calls: Array<{ method: BrowserDriverMethod; args: unknown[] }> = [];

  private readonly tabs = new Map<number, BrowserTabRef>();
  private readonly observations = new Map<number, BrowserObservation>();
  private readonly screenshots = new Map<number, BrowserScreenshot>();
  private readonly actionResults: MockActionResults;
  private readonly failures: Partial<Record<BrowserDriverMethod, Error | string>>;
  private nextTabId = 1;

  constructor(options: MockBrowserDriverOptions = {}) {
    for (const tab of options.tabs ?? []) {
      this.tabs.set(tab.tabId, clone(tab));
      this.nextTabId = Math.max(this.nextTabId, tab.tabId + 1);
    }
    for (const [tabId, observation] of Object.entries(options.observations ?? {})) {
      this.observations.set(Number(tabId), clone(observation));
    }
    for (const [tabId, screenshot] of Object.entries(options.screenshots ?? {})) {
      this.screenshots.set(Number(tabId), clone(screenshot));
    }
    this.actionResults = options.actionResults ?? {};
    this.failures = options.failures ?? {};
  }

  async listTabs(options?: BrowserOperationOptions): Promise<BrowserTabRef[]> {
    this.record("listTabs", options);
    return Array.from(this.tabs.values()).map(clone);
  }

  async openTab(input: BrowserOpenTabInput, options?: BrowserOperationOptions): Promise<BrowserTabRef> {
    this.record("openTab", input, options);
    const tab: BrowserTabRef = {
      tabId: this.nextTabId,
      url: input.url,
      title: input.url,
      active: input.active ?? false,
      status: "complete",
    };
    this.nextTabId += 1;
    this.tabs.set(tab.tabId, clone(tab));
    return clone(tab);
  }

  async closeTab(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("closeTab", tabId, options);
    this.tabs.delete(tabId);
    return clone(this.actionResults.closeTab ?? defaultAction(`Closed tab ${tabId}.`));
  }

  async focusTab(tabId: number, options?: BrowserOperationOptions): Promise<BrowserTabRef> {
    this.record("focusTab", tabId, options);
    const tab = this.getTab(tabId);
    for (const existing of this.tabs.values()) {
      existing.active = false;
    }
    tab.active = true;
    this.tabs.set(tabId, tab);
    return clone(tab);
  }

  async navigate(tabId: number, input: BrowserNavigateInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("navigate", tabId, input, options);
    const tab = this.getTab(tabId);
    tab.url = input.url;
    tab.title = input.url;
    tab.status = "complete";
    tab.active = input.active ?? tab.active;
    this.tabs.set(tabId, tab);
    return clone(this.actionResults.navigate ?? defaultAction(`Navigated tab ${tabId}.`, { navigated: true }));
  }

  async reload(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("reload", tabId, options);
    this.getTab(tabId);
    return clone(this.actionResults.reload ?? defaultAction(`Reloaded tab ${tabId}.`, { navigated: true }));
  }

  async waitForStable(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("waitForStable", tabId, options);
    this.getTab(tabId);
    return clone(this.actionResults.waitForStable ?? defaultAction(`Tab ${tabId} is stable.`));
  }

  async observe(tabId: number, options?: BrowserOperationOptions): Promise<BrowserObservation> {
    this.record("observe", tabId, options);
    const observation = this.observations.get(tabId);
    if (!observation) {
      throw new Error(`No mock observation for tab ${tabId}.`);
    }
    return clone(observation);
  }

  async screenshot(tabId: number, input?: BrowserScreenshotInput, options?: BrowserOperationOptions): Promise<BrowserScreenshot> {
    this.record("screenshot", tabId, input, options);
    const screenshot = this.screenshots.get(tabId);
    if (!screenshot) {
      throw new Error(`No mock screenshot for tab ${tabId}.`);
    }
    return clone({
      ...screenshot,
      fullPage: input?.fullPage ?? screenshot.fullPage,
    });
  }

  async click(tabId: number, input: BrowserClickInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("click", tabId, input, options);
    return clone(this.actionResults.click ?? defaultAction(`Clicked ${input.targetRef.refId}.`, { targetRef: input.targetRef }));
  }

  async type(tabId: number, input: BrowserTypeInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("type", tabId, input, options);
    return clone(this.actionResults.type ?? defaultAction(`Typed into ${input.targetRef.refId}.`, { targetRef: input.targetRef }));
  }

  async press(tabId: number, input: BrowserPressInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("press", tabId, input, options);
    return clone(this.actionResults.press ?? defaultAction(`Pressed ${input.key}.`, { targetRef: input.targetRef }));
  }

  async scroll(tabId: number, input: BrowserScrollInput, options?: BrowserOperationOptions): Promise<BrowserActionResult> {
    this.record("scroll", tabId, input, options);
    return clone(this.actionResults.scroll ?? defaultAction(`Scrolled ${input.direction}.`));
  }

  async evaluateLimited(tabId: number, input: BrowserEvaluateInput, options?: BrowserOperationOptions): Promise<BrowserEvaluateResult> {
    this.record("evaluateLimited", tabId, input, options);
    return clone(this.actionResults.evaluateLimited ?? {
      status: "success",
      message: `Evaluated ${input.scriptId}.`,
      problems: [],
      value: undefined,
    });
  }

  private record(method: BrowserDriverMethod, ...args: unknown[]) {
    const maybeOptions = args[args.length - 1] as BrowserOperationOptions | undefined;
    ensureNotAborted(maybeOptions);
    throwFailure(method, this.failures);
    this.calls.push({ method, args });
  }

  private getTab(tabId: number) {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`No mock tab ${tabId}.`);
    }
    return clone(tab);
  }
}

