import type { ActionResult, AgentAction, SnapshotData } from "../shared/types";
import { executeAction } from "./actions";
import { scanPage } from "./scanner";

export function scanCurrentPage(): SnapshotData {
  return scanPage();
}

export async function executeCurrentAction(action: AgentAction): Promise<ActionResult> {
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
