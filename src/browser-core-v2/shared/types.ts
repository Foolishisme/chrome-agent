import type {
  BrowserActionResult,
  BrowserControlObservation,
  BrowserLinkObservation,
  BrowserObservationCoverage,
  BrowserPageProblem,
  BrowserTabRef,
  BrowserTargetRef,
} from "../../shared/browser-capability";

export type BrowserCoreV2Action = "open" | "navigate" | "observe" | "read" | "extractLinksAndControls" | "finalize";

export interface BrowserCoreReadableContent {
  status: "success" | "partial" | "failed";
  title: string;
  url: string;
  text: string;
  markdown: string;
  textLength: number;
  strategy: "readability" | "fallback";
  truncated: boolean;
  problems: BrowserPageProblem[];
}

export interface BrowserCorePageState {
  url: string;
  title: string;
  readyState: DocumentReadyState;
  visibilityState?: DocumentVisibilityState;
  likelySpa: boolean;
  hasPasswordInput: boolean;
  hasBlockingOverlay: boolean;
}

export interface BrowserCoreSnapshot {
  tab?: BrowserTabRef;
  url: string;
  title: string;
  mainText: string;
  links: BrowserLinkObservation[];
  controls: BrowserControlObservation[];
  targets: BrowserTargetRef[];
  problems: BrowserPageProblem[];
  truncated: boolean;
  coverage: BrowserObservationCoverage;
}

export interface BrowserCoreLinksAndControls {
  links: BrowserLinkObservation[];
  controls: BrowserControlObservation[];
  targets: BrowserTargetRef[];
  coverage: Pick<BrowserObservationCoverage, "linkCount" | "controlCount" | "targetCount">;
}

export interface BrowserCoreContentBridge {
  snapshot(): BrowserCoreSnapshot;
  readContent(): BrowserCoreReadableContent;
  getLinksAndControls(): BrowserCoreLinksAndControls;
  getPageState(): BrowserCorePageState;
  click(refId: string): Promise<BrowserActionResult>;
  type(refId: string, text: string, options?: { submit?: boolean }): Promise<BrowserActionResult>;
  press(key: string, refId?: string): Promise<BrowserActionResult>;
  scroll(direction: "up" | "down", amount?: number): Promise<BrowserActionResult>;
}
