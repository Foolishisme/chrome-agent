export type PageType = "home" | "search" | "google_search" | "content" | "pdf" | "unknown";

export type TaskType = "commerce_search" | "public_research";
export type OutputMode = "inline" | "artifact";

export type PlanStepStatus = "pending" | "running" | "succeeded" | "failed" | "blocked";

export type ToolName =
  | "compileTaskSpec"
  | "openSearchResults"
  | "collectCommerceCandidates"
  | "collectResearchCandidates"
  | "readResearchSourceFacts"
  | "finalizeCommerceResult"
  | "finalizeResearchResult";

export type RuntimeStatus = "idle" | "running" | "done" | "error";

export type ToolExecutionStatus = "success" | "partial" | "retryable_error" | "fatal_error";

export type FinalStatus = "success" | "partial" | "failed" | "blocked";

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

export type SemanticRole =
  | "main"
  | "navigation"
  | "search"
  | "form"
  | "dialog"
  | "alert"
  | "heading"
  | "section"
  | "article"
  | "list"
  | "listitem"
  | "link"
  | "button"
  | "input"
  | "textarea"
  | "checkbox"
  | "radio"
  | "tab"
  | "tabpanel"
  | "image"
  | "text"
  | "unknown";

export interface SemanticNodeState {
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  required?: boolean;
  invalid?: boolean;
}

export interface SemanticNode {
  ref: string;
  role: SemanticRole;
  name: string;
  text?: string;
  level?: number;
  state?: SemanticNodeState;
  bounds?: ElementRect;
  children?: SemanticNode[];
}

export interface SemanticSnapshot {
  version: 1;
  url: string;
  title: string;
  nodeCount: number;
  truncated: boolean;
  root: SemanticNode;
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
  outputMode?: OutputMode;
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
  outputMode?: OutputMode;
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
  semanticSnapshot: SemanticSnapshot;
  productCandidates: ExtractedItem[];
  pageReady: PageReadyState;
  pageFacts: PageFacts;
  timestamp: number;
}

export interface PlanStep {
  stepId: string;
  goal: string;
  allowedTools: ToolName[];
  successCriteria: string[];
  status: PlanStepStatus;
}

export interface MarkdownArtifact {
  id: string;
  kind: "markdown";
  title: string;
  fileName: string;
  mimeType: "text/markdown";
  content: string;
  summary?: string;
}

export type ResultArtifact = MarkdownArtifact;

export interface FinalResult {
  outputMode: OutputMode;
  status: FinalStatus;
  summary: string;
  markdown: string;
  keyResults: string[];
  completedSteps: string[];
  remainingOrFailedSteps: string[];
  errorsOrBlockers: string[];
  artifacts: ResultArtifact[];
  suggestedNextAction: string;
}

export interface ConversationTurn {
  turnId: number;
  sessionId: string;
  goal: string;
  answerSummary: string;
  answerMarkdown: string;
  timeline: StepRecord[];
  savedAt: number;
}

export interface ConversationSummary {
  conversationId: string;
  title: string;
  turnCount: number;
  updatedAt: number;
}

export interface PageFactExtraction {
  status: "success" | "partial";
  pageTitle: string;
  bodyExcerpt: string;
  textLength: number;
  extractionStrategy?: "readability" | "fallback";
  reason?: string;
}

export interface ManualExtractionRecord {
  id: string;
  url: string;
  pageTitle: string;
  pageType: PageType;
  extractedAt: number;
  extraction: PageFactExtraction;
  contentState?: PageContentState;
}

export interface ResearchSourceResult {
  candidate: ResearchCandidate;
  status: "success" | "partial" | "failed";
  pageTitle: string;
  bodyExcerpt: string;
  sourceUrl: string;
  unresolvedIssues: string[];
  textLength: number;
}

export type AgentAction =
  | { type: "CLICK"; agentId: string }
  | { type: "TYPE"; agentId: string; text: string; submit?: boolean }
  | { type: "NAVIGATE"; url: string }
  | { type: "SCROLL"; direction: "up" | "down"; amount?: number }
  | { type: "RECOVER_CLOSE_DIALOG" }
  | { type: "EXTRACT_LIST"; limit?: number }
  | { type: "EXTRACT_SEARCH_RESULTS"; limit?: number }
  | { type: "EXTRACT_PAGE_FACTS" }
  | { type: "DONE"; summary: string; items?: ExtractedItem[] };

export interface ActionResult {
  success: boolean;
  actionType: AgentAction["type"];
  message: string;
  observation?: Record<string, unknown>;
  items?: ExtractedItem[];
  researchCandidates?: ResearchCandidate[];
  pageFactsResult?: PageFactExtraction;
  navigated?: boolean;
  highlightedAgentId?: string;
  recoveryKind?: "close_dialog";
  recoveryApplied?: boolean;
  recoveryTarget?: string;
  errorCode?: string;
}

export interface ToolResult {
  status: ToolExecutionStatus;
  summary: string;
  outputs: Record<string, unknown>;
  artifacts: ResultArtifact[];
  facts: Record<string, unknown>;
  stepStatus: PlanStepStatus;
  errorCode?: string;
  retryHint?: string;
  terminal?: boolean;
}

export interface StepRecord {
  step: number;
  planStepId?: string;
  status: RuntimeStatus;
  stepSummary: string;
  nextIntent?: string;
  expectedOutcome?: string;
  action?: AgentAction;
  actionResult?: ActionResult;
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
  status: ToolExecutionStatus;
  summary: string;
  stepStatus: PlanStepStatus;
  timestamp: number;
}

export interface FailureRecord {
  toolName?: ToolName;
  message: string;
  errorCode?: string;
  timestamp: number;
}

export interface SessionMemory {
  goal: string;
  taskType: TaskType;
  conversationId?: string;
  conversationTitle?: string;
  currentTurnId?: number;
  conversationTurns: ConversationTurn[];
  plan: PlanStep[];
  taskSpec?: TaskSpec;
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
    actionRetryCount: number;
    recoveryCount: number;
    lastRecoveryAction?: string;
    pageWaitRecoveryCount: number;
    dialogCloseRecoveryCount: number;
    searchReopenRecoveryCount: number;
    queryRefineTried: boolean;
    sameToolRetryCount: number;
    sameToolRetryTool?: ToolName;
    consecutiveNoProgressCount: number;
    startedAt: number;
  };
}

export interface SessionPublicState {
  sessionId?: string;
  goal?: string;
  conversationId?: string;
  conversationTitle?: string;
  conversationTurns?: ConversationTurn[];
  availableConversations?: ConversationSummary[];
  taskType?: TaskType;
  taskSpec?: TaskSpec;
  status: RuntimeStatus;
  currentStepId?: string;
  currentTool?: ToolName;
  currentStep: number;
  plan: PlanStep[];
  budgetLow?: boolean;
  elapsedMs?: number;
  stepSummary?: string;
  lastAction?: AgentAction;
  lastActionResult?: ActionResult;
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
  finalResult?: FinalResult;
  updatedAt: number;
}
