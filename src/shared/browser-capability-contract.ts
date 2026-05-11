import type { ElementRect, SemanticRole, SemanticSnapshot } from "./agent-domain-model";

export type BrowserTabStatus = "loading" | "complete" | "unloaded" | "unknown";

export interface BrowserTabRef {
  tabId: number;
  windowId?: number;
  url?: string;
  title?: string;
  active: boolean;
  status: BrowserTabStatus;
}

export type BrowserTargetSource = "cdp" | "content_script" | "mock";

export interface BrowserTargetRef {
  tabId: number;
  refId: string;
  role: SemanticRole;
  name: string;
  text?: string;
  bounds?: ElementRect;
  source: BrowserTargetSource;
}

export type BrowserRiskLevel =
  | "read_only"
  | "low_risk_write"
  | "medium_risk_submit"
  | "high_risk_irreversible";

export type BrowserPageProblemCode =
  | "unsupported_page"
  | "navigation_failed"
  | "login_wall"
  | "blocking_overlay"
  | "empty_content"
  | "cdp_attach_failed"
  | "permission_denied"
  | "stale_target"
  | "screenshot_failed"
  | "operation_failed"
  | "operation_aborted"
  | "evaluate_blocked";

export interface BrowserPageProblem {
  code: BrowserPageProblemCode;
  message: string;
  recoverable: boolean;
  detail?: string;
  suggestedNextAction?: string;
}

export function createBrowserPageProblem(
  code: BrowserPageProblemCode,
  message: string,
  options: {
    recoverable?: boolean;
    detail?: string;
    suggestedNextAction?: string;
  } = {},
): BrowserPageProblem {
  return {
    code,
    message,
    recoverable: options.recoverable ?? code !== "permission_denied",
    detail: options.detail,
    suggestedNextAction: options.suggestedNextAction,
  };
}

export interface BrowserLinkObservation {
  text: string;
  url: string;
  targetRef?: BrowserTargetRef;
}

export interface BrowserControlObservation {
  targetRef: BrowserTargetRef;
  value?: string;
  disabled?: boolean;
  required?: boolean;
}

export interface BrowserObservationCoverage {
  mainTextChars: number;
  linkCount: number;
  controlCount: number;
  targetCount: number;
}

export interface BrowserObservation {
  tab: BrowserTabRef;
  url: string;
  title: string;
  mainText: string;
  links: BrowserLinkObservation[];
  controls: BrowserControlObservation[];
  semanticSnapshot?: SemanticSnapshot;
  targets: BrowserTargetRef[];
  problems: BrowserPageProblem[];
  truncated: boolean;
  coverage: BrowserObservationCoverage;
}

export type BrowserActionStatus = "success" | "partial" | "failed" | "blocked";

export interface BrowserActionResult {
  status: BrowserActionStatus;
  message: string;
  problems: BrowserPageProblem[];
  suggestedNextAction?: string;
  navigated?: boolean;
  targetRef?: BrowserTargetRef;
  observation?: Record<string, unknown>;
}

export interface BrowserScreenshot {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  width: number;
  height: number;
  fullPage: boolean;
  sanitized: boolean;
  problems: BrowserPageProblem[];
}

export interface BrowserEvaluateResult extends BrowserActionResult {
  value?: unknown;
}

export interface BrowserOperationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  reason?: string;
}

export interface BrowserOpenTabInput {
  url: string;
  active?: boolean;
}

export interface BrowserNavigateInput {
  url: string;
  active?: boolean;
}

export interface BrowserScreenshotInput {
  fullPage?: boolean;
}

export interface BrowserClickInput {
  targetRef: BrowserTargetRef;
  riskLevel?: BrowserRiskLevel;
}

export interface BrowserTypeInput {
  targetRef: BrowserTargetRef;
  text: string;
  submit?: boolean;
  riskLevel?: BrowserRiskLevel;
}

export interface BrowserPressInput {
  key: string;
  targetRef?: BrowserTargetRef;
  riskLevel?: BrowserRiskLevel;
}

export interface BrowserScrollInput {
  direction: "up" | "down";
  amount?: number;
}

export interface BrowserEvaluateInput {
  scriptId: string;
  args?: Record<string, unknown>;
  riskLevel?: BrowserRiskLevel;
}
