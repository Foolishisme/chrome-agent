export type PageType = "home" | "search" | "detail" | "unknown";

export type RuntimeStatus =
  | "idle"
  | "scanning"
  | "planning"
  | "acting"
  | "observing"
  | "done"
  | "error";

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InteractiveElement {
  agentId: string;
  role: "input" | "button" | "link" | "unknown";
  text: string;
  tagName: string;
  isVisible: boolean;
  rect: ElementRect;
}

export interface ExtractedItem {
  title: string;
  priceText: string;
  url: string;
  shopText?: string;
  tags?: string[];
  summary?: string;
}

export interface SnapshotData {
  url: string;
  title: string;
  pageType: PageType;
  interactiveElements: InteractiveElement[];
  productCandidates: ExtractedItem[];
  timestamp: number;
}

export type AgentAction =
  | { type: "CLICK"; agentId: string }
  | { type: "TYPE"; agentId: string; text: string; submit?: boolean }
  | { type: "SCROLL"; direction: "up" | "down"; amount?: number }
  | { type: "EXTRACT_LIST" }
  | { type: "DONE"; summary: string; items?: ExtractedItem[] };

export interface ToolResult {
  success: boolean;
  actionType: AgentAction["type"];
  message: string;
  observation?: Record<string, unknown>;
  items?: ExtractedItem[];
  navigated?: boolean;
  highlightedAgentId?: string;
  errorCode?: string;
}

export interface StepRecord {
  step: number;
  status: RuntimeStatus;
  stepSummary: string;
  nextIntent?: string;
  expectedOutcome?: string;
  action?: AgentAction;
  actionResult?: ToolResult;
  snapshotSummary?: string;
  timestamp: number;
}

export interface SessionMemory {
  goal: string;
  plan: string[];
  stepHistory: StepRecord[];
  pageSnapshot?: SnapshotData;
  extractedItems: ExtractedItem[];
  liveStepSummary?: string;
  nextIntent?: string;
  lastError?: string;
  finalSummary?: string;
  runtimeMeta: {
    sessionId: string;
    tabId: number;
    pageType: PageType;
    status: RuntimeStatus;
    currentStep: number;
    llmRetryCount: number;
    actionRetryCount: number;
    startedAt: number;
  };
}

export interface LlmDecision {
  stepSummary: string;
  nextIntent: string;
  expectedOutcome: string;
  action: AgentAction;
  done: boolean;
}

export interface PlanningResult {
  plan: string[];
}

export interface SessionPublicState {
  sessionId?: string;
  goal?: string;
  status: RuntimeStatus;
  currentStep: number;
  plan: string[];
  stepSummary?: string;
  lastAction?: AgentAction;
  lastActionResult?: ToolResult;
  items: ExtractedItem[];
  error?: string;
  finalSummary?: string;
  updatedAt: number;
}
