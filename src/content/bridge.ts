import type { AgentAction, SnapshotData, ToolResult } from "../shared/types";
import { executeAction } from "./actions";
import { scanPage } from "./scanner";

export function scanCurrentPage(): SnapshotData {
  return scanPage();
}

export async function executeCurrentAction(action: AgentAction): Promise<ToolResult> {
  return await executeAction(action);
}

(globalThis as typeof globalThis & {
  __browserAgentMvpDirectBridge?: {
    scanCurrentPage: typeof scanCurrentPage;
    executeCurrentAction: typeof executeCurrentAction;
  };
}).__browserAgentMvpDirectBridge = {
  scanCurrentPage,
  executeCurrentAction,
};
