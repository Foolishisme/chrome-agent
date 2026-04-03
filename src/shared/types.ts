export type PageType = "home" | "search" | "google_search" | "content" | "pdf" | "unknown";

export type TaskType = "commerce_search" | "public_research";

export type AgentPhase = "planning" | "searching" | "extracting" | "filtering" | "reading" | "aggregating" | "done";

export type PlanStepStatus = "pending" | "running" | "succeeded" | "failed" | "blocked";

export type ToolName =
  | "compileTaskSpec"
  | "compileTask"
  | "openSearchResults"
  | "searchInSite"
  | "collectCommerceCandidates"
  | "collectResearchCandidates"
  | "extractStructuredResults"
  | "filterCandidates"
  | "readResearchSourceFacts"
  | "readPageFacts"
  | "finalizeCommerceResult"
  | "finalizeResearchResult"
  | "aggregateTaskResults";

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

export interface ResearchCandidate {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  displayUrl?: string;
  rank: number;
  isAd?: boolean;
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

export interface SearchResultsState {
  present: boolean;
  loaded: boolean;
  resultCount: number;
  naturalCount: number;
  adCount: number;
}

export interface PageContentState {
  readable: boolean;
  textLength: number;
  paragraphCount: number;
  hasPasswordInput: boolean;
  hasBlockingOverlay: boolean;
  likelyLoginWall: boolean;
  likelySpa: boolean;
  reason?: string;
}

export interface PageFacts {
  searchBox: SearchControlState;
  searchSubmit: SearchControlState;
  resultList?: ResultListState;
  searchResults?: SearchResultsState;
  pageContent?: PageContentState;
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

export interface CommerceFilterDiagnostics {
  kind: "commerce";
  inputCount: number;
  dedupedCount: number;
  budgetMatchedCount: number;
  finalCount: number;
  requestedTopK: number;
  llmInputLimit: number;
  budgetRangeText?: string;
}

export interface ResearchFilterDiagnostics {
  kind: "research";
  inputCount: number;
  dedupedCount: number;
  finalCount: number;
  skippedAdCount: number;
  skippedInternalCount: number;
  skippedDuplicateCount: number;
  skippedPdfCount: number;
  skippedInvalidCount: number;
}

export type FilterDiagnostics = CommerceFilterDiagnostics | ResearchFilterDiagnostics;

export interface CommerceTaskSpec {
  taskType: "commerce_search";
  originalGoal: string;
  category?: string;
  budget?: number;
  budgetMin?: number;
  budgetMax?: number;
  topK: number;
  llmInputLimit: number;
  extractLimit: number;
  searchQuery: string;
  querySource: "rule" | "llm-lite";
  notes: string[];
}

export type SearchTaskSpec = CommerceTaskSpec;

export interface PublicResearchTaskSpec {
  taskType: "public_research";
  originalGoal: string;
  searchQuery: string;
  querySource: "rule" | "llm-lite";
  notes: string[];
  searchEngine: "google";
  candidateLimit: number;
  sourceTargetCount: number;
}

export type TaskSpec = CommerceTaskSpec | PublicResearchTaskSpec;

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

export interface SubtaskSpec {
  id: string;
  type: string;
  goal: string;
  allowedTools: ToolName[];
  successCriteria: string[];
}

export interface PlanStep {
  stepId: string;
  goal: string;
  allowedTools: ToolName[];
  successCriteria: string[];
  status: PlanStepStatus;
}

export interface TaskPlan {
  taskType: TaskType;
  steps: string[];
  subtasks: SubtaskSpec[];
}

export interface SubtaskResult {
  subtaskId: string;
  status: "success" | "partial" | "failed";
  data: Record<string, unknown>;
  diagnostics: string[];
  sources?: string[];
  unresolvedIssues?: string[];
}

export interface FinalResult {
  overallStatus: "success" | "partial" | "failed";
  summaryMarkdown: string;
  usedSubtasks: string[];
  unresolvedIssues: string[];
}

export interface PageFactExtraction {
  status: "success" | "partial";
  pageTitle: string;
  summary: string;
  keyPoints: string[];
  textLength: number;
  reason?: string;
}

export interface ResearchSourceResult {
  candidate: ResearchCandidate;
  status: "success" | "partial" | "failed";
  pageTitle: string;
  summary: string;
  keyPoints: string[];
  sourceUrl: string;
  unresolvedIssues: string[];
  textLength: number;
}

export type AgentAction =
  | { type: "CLICK"; agentId: string }
  | { type: "TYPE"; agentId: string; text: string; submit?: boolean }
  | { type: "NAVIGATE"; url: string }
  | { type: "SCROLL"; direction: "up" | "down"; amount?: number }
  | { type: "EXTRACT_LIST"; limit?: number }
  | { type: "EXTRACT_SEARCH_RESULTS"; limit?: number }
  | { type: "EXTRACT_PAGE_FACTS" }
  | { type: "DONE"; summary: string; items?: ExtractedItem[] };

export interface ToolResult {
  success: boolean;
  actionType: AgentAction["type"];
  message: string;
  observation?: Record<string, unknown>;
  items?: ExtractedItem[];
  researchCandidates?: ResearchCandidate[];
  pageFactsResult?: PageFactExtraction;
  navigated?: boolean;
  highlightedAgentId?: string;
  errorCode?: string;
}

export type ActionResult = ToolResult;

export interface StepRecord {
  step: number;
  planStepId?: string;
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

export interface ToolCallRecord {
  toolName: ToolName;
  phase: AgentPhase;
  status: "success" | "error";
  summary: string;
  timestamp: number;
}

export interface FailureRecord {
  phase: AgentPhase;
  toolName?: ToolName;
  message: string;
  timestamp: number;
}

export interface SessionMemory {
  goal: string;
  taskType: TaskType;
  currentPhase: AgentPhase;
  plan: PlanStep[];
  taskPlan?: TaskPlan;
  taskSpec?: TaskSpec;
  subtaskResults: SubtaskResult[];
  toolHistory: ToolCallRecord[];
  currentFacts: Record<string, unknown>;
  stepHistory: StepRecord[];
  logs: DebugLogEntry[];
  pageSnapshot?: SnapshotData;
  rawExtractedItems: ExtractedItem[];
  extractedItems: ExtractedItem[];
  researchCandidates: ResearchCandidate[];
  researchSources: ResearchSourceResult[];
  filterDiagnostics?: FilterDiagnostics;
  liveStepSummary?: string;
  nextIntent?: string;
  recoveryHint?: string;
  lastError?: string;
  failures: FailureRecord[];
  unresolvedIssues: string[];
  activeSourceIndex: number;
  finalSummary?: string;
  finalOutput?: string;
  finalResult?: FinalResult;
  runtimeMeta: {
    sessionId: string;
    tabId: number;
    pageType: PageType;
    status: RuntimeStatus;
    currentStepId?: string;
    currentTool?: ToolName;
    currentStep: number;
    budgetLow?: boolean;
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
  taskType?: TaskType;
  taskSpec?: TaskSpec;
  taskPlan?: TaskPlan;
  subtaskResults?: SubtaskResult[];
  status: RuntimeStatus;
  currentPhase?: AgentPhase;
  currentStepId?: string;
  currentTool?: ToolName;
  currentStep: number;
  plan: PlanStep[];
  budgetLow?: boolean;
  elapsedMs?: number;
  stepSummary?: string;
  lastAction?: AgentAction;
  lastActionResult?: ToolResult;
  items: ExtractedItem[];
  rawItemCount?: number;
  researchCandidates?: ResearchCandidate[];
  researchSources?: ResearchSourceResult[];
  filterDiagnostics?: FilterDiagnostics;
  logs: DebugLogEntry[];
  timeline: StepRecord[];
  pageSnapshot?: SnapshotData;
  recoveryHint?: string;
  error?: string;
  unresolvedIssues?: string[];
  finalSummary?: string;
  finalOutput?: string;
  finalResult?: FinalResult;
  updatedAt: number;
}
