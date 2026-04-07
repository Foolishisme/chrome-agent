import type {
  ActionResult,
  AgentAction,
  DebugLogEntry,
  DebugLogLevel,
  SessionMemory,
  SnapshotData,
  ToolName,
  ToolResult,
} from "../../shared/types";

export type StepOptions = {
  stepSummary: string;
  nextIntent?: string;
  expectedOutcome?: string;
  action?: AgentAction;
  actionResult?: ActionResult;
  snapshot?: SnapshotData;
  snapshotSummary?: string;
};

export interface ToolExecutionContext {
  memory: SessionMemory;
  signal: AbortSignal;
  scanPage(): Promise<SnapshotData>;
  ensureUsableSnapshot(): Promise<SnapshotData>;
  executeAction(action: AgentAction, stepSummary: string): Promise<ActionResult>;
  settleAfterAction(action: AgentAction): Promise<void>;
  appendLog(source: DebugLogEntry["source"], level: DebugLogLevel, message: string, detail?: unknown): void;
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface AgentToolDefinition {
  name: ToolName;
  run(context: ToolExecutionContext): Promise<ToolResult>;
}

export function createToolResult(
  result: Pick<ToolResult, "status" | "summary" | "outputs" | "facts" | "stepStatus"> &
    Partial<Omit<ToolResult, "status" | "summary" | "outputs" | "facts" | "stepStatus">>,
): ToolResult {
  return {
    artifacts: [],
    terminal: false,
    ...result,
  };
}
