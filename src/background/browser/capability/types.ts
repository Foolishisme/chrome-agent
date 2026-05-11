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

export interface BrowserDriver {
  listTabs(options?: BrowserOperationOptions): Promise<BrowserTabRef[]>;
  openTab(input: BrowserOpenTabInput, options?: BrowserOperationOptions): Promise<BrowserTabRef>;
  closeTab(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  focusTab(tabId: number, options?: BrowserOperationOptions): Promise<BrowserTabRef>;
  navigate(tabId: number, input: BrowserNavigateInput, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  reload(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  waitForStable(tabId: number, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  observe(tabId: number, options?: BrowserOperationOptions): Promise<BrowserObservation>;
  screenshot(tabId: number, input?: BrowserScreenshotInput, options?: BrowserOperationOptions): Promise<BrowserScreenshot>;
  click(tabId: number, input: BrowserClickInput, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  type(tabId: number, input: BrowserTypeInput, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  press(tabId: number, input: BrowserPressInput, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  scroll(tabId: number, input: BrowserScrollInput, options?: BrowserOperationOptions): Promise<BrowserActionResult>;
  evaluateLimited(tabId: number, input: BrowserEvaluateInput, options?: BrowserOperationOptions): Promise<BrowserEvaluateResult>;
}


