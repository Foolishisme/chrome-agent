import type { ActionResult, AgentAction, SnapshotData } from "../shared/agent-domain-model";
import { executeAction } from "./content-action-executor";
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
