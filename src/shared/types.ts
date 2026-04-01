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

export interface PageReadyState {
  ready: boolean;
  reason: string;
  checks: string[];
}

export interface SearchControlState {
  present: boolean;
  visible: boolean;
  text?: string;
}

export interface ResultListState {
  present: boolean;
  loaded: boolean;
  cardCount: number;
  productLinkCount: number;
  emptyState: boolean;
}

export interface PageFacts {
  searchBox: SearchControlState;
  searchSubmit: SearchControlState;
  resultList?: ResultListState;
}

export interface ExtractionDiagnostics {
  cardCandidateCount: number;
  productLinkCount: number;
  primaryItemCount: number;
  fallbackItemCount: number;
  finalItemCount: number;
  filteredOutCount: number;
  missingTitleCount: number;
  missingPriceCount: number;
  missingUrlCount: number;
}

export interface FilterDiagnostics {
  inputCount: number;
  dedupedCount: number;
  budgetMatchedCount: number;
  finalCount: number;
  appliedTopK: number;
  budgetRangeText?: string;
}

export interface SearchTaskSpec {
  originalGoal: string;
  category: string;
  budget?: number;
  budgetMin?: number;
  budgetMax?: number;
  topK: number;
  searchQuery: string;
  querySource: "rule" | "llm-lite";
  notes: string[];
}

export interface SnapshotData {
  url: string;
  title: string;
  pageType: PageType;
  interactiveElements: InteractiveElement[];
  productCandidates: ExtractedItem[];
  pageReady: PageReadyState;
  pageFacts: PageFacts;
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

export type DebugLogLevel = "info" | "warn" | "error";

export interface DebugLogEntry {
  timestamp: number;
  level: DebugLogLevel;
  source: "runtime" | "llm" | "content";
  message: string;
  detail?: string;
}

export interface SessionMemory {
  goal: string;
  plan: string[];
  taskSpec?: SearchTaskSpec;
  stepHistory: StepRecord[];
  logs: DebugLogEntry[];
  pageSnapshot?: SnapshotData;
  rawExtractedItems: ExtractedItem[];
  extractedItems: ExtractedItem[];
  filterDiagnostics?: FilterDiagnostics;
  liveStepSummary?: string;
  nextIntent?: string;
  recoveryHint?: string;
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
    pageReadyRetryCount: number;
    recoveryCount: number;
    lastRecoveryAction?: string;
    queryRefineTried: boolean;
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
  taskSpec?: SearchTaskSpec;
  status: RuntimeStatus;
  currentStep: number;
  plan: string[];
  stepSummary?: string;
  lastAction?: AgentAction;
  lastActionResult?: ToolResult;
  items: ExtractedItem[];
  rawItemCount?: number;
  filterDiagnostics?: FilterDiagnostics;
  logs: DebugLogEntry[];
  timeline: StepRecord[];
  pageSnapshot?: SnapshotData;
  recoveryHint?: string;
  error?: string;
  finalSummary?: string;
  updatedAt: number;
}
