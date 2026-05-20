import { LIMITS } from "../../shared/agent-runtime-config";
import { RuntimeError } from "../../shared/runtime-error";
import type {
  ActionResult,
  AgentAction,
  CommerceTaskSpec,
  SnapshotData,
} from "../../shared/agent-domain-model";
import type { ToolExecutionContext } from "./tool-execution-context";

function stripWhitespace(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function getSearchPageSignals(snapshot: SnapshotData) {
  const signals = [snapshot.pageFacts.searchBox.text, snapshot.title];

  try {
    const parsed = new URL(snapshot.url);
    signals.push(parsed.searchParams.get("keyword") ?? undefined);
    signals.push(parsed.searchParams.get("q") ?? undefined);
  } catch {
    // Ignore malformed URLs.
  }

  return signals.filter((signal): signal is string => !!signal && signal.trim().length > 0);
}

export function hasMatchingQuery(snapshot: SnapshotData, searchQuery: string) {
  const normalizedQuery = stripWhitespace(searchQuery);
  if (!normalizedQuery) {
    return false;
  }

  const queryTokens = searchQuery
    .split(/\s+/)
    .map((token) => stripWhitespace(token))
    .filter((token) => token.length >= 2);

  return getSearchPageSignals(snapshot).some((signal) => {
    const normalizedSignal = stripWhitespace(signal);
    return (
      normalizedSignal.includes(normalizedQuery) ||
      (queryTokens.length > 0 && queryTokens.every((token) => normalizedSignal.includes(token)))
    );
  });
}

export function buildCommerceSearchUrl(taskSpec: CommerceTaskSpec) {
  const url = new URL("https://search.jd.com/Search");
  url.searchParams.set("keyword", taskSpec.searchQuery);
  url.searchParams.set("enc", "utf-8");
  return url.toString();
}

export function detectCommerceSearchBlocker(snapshot: SnapshotData) {
  try {
    const parsed = new URL(snapshot.url);

    if (
      (parsed.hostname === "passport.jd.com" || parsed.hostname === "plogin.m.jd.com" || parsed.pathname.includes("/new/login"))
    ) {
      return "JD redirected the search to a login page.";
    }
  } catch {
    // Ignore malformed URLs.
  }

  return undefined;
}

function walkSemanticNodes(node: SnapshotData["semanticSnapshot"]["root"]): Array<SnapshotData["semanticSnapshot"]["root"]> {
  const nodes = [node];
  for (const child of node.children ?? []) {
    nodes.push(...walkSemanticNodes(child));
  }
  return nodes;
}

function hasSemanticRole(snapshot: SnapshotData, role: SnapshotData["semanticSnapshot"]["root"]["role"]) {
  return walkSemanticNodes(snapshot.semanticSnapshot.root).some((node) => node.role === role);
}

function hasRecoverableDialog(snapshot: SnapshotData) {
  return hasSemanticRole(snapshot, "dialog") || hasSemanticRole(snapshot, "alert");
}

function hasSearchPageStructureIssue(snapshot: SnapshotData) {
  if (snapshot.pageReady.ready) {
    return false;
  }

  const hasMain = hasSemanticRole(snapshot, "main");
  const hasSearch = hasSemanticRole(snapshot, "search");
  const hasList = hasSemanticRole(snapshot, "list");
  const hasHighValueNode =
    hasList || hasSemanticRole(snapshot, "heading") || hasSemanticRole(snapshot, "link") || hasSemanticRole(snapshot, "button") || hasSemanticRole(snapshot, "input");

  return !hasMain && !hasSearch && !hasHighValueNode;
}

async function attemptDialogCloseRecovery(
  context: ToolExecutionContext,
  snapshot: SnapshotData,
  reason: string,
): Promise<SnapshotData | undefined> {
  if (!hasRecoverableDialog(snapshot) || context.memory.runtimeMeta.dialogCloseRecoveryCount >= 1) {
    return undefined;
  }

  context.memory.runtimeMeta.dialogCloseRecoveryCount += 1;
  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "RECOVER_CLOSE_DIALOG";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.dialogCloseRecoveryCount}/1: close dialog once.`;
  context.appendLog("runtime", "warn", "Triggering tool-local dialog-close recovery.", {
    reason,
    dialogCloseRecoveryCount: context.memory.runtimeMeta.dialogCloseRecoveryCount,
  });

  const action: AgentAction = { type: "RECOVER_CLOSE_DIALOG" };
  const result = await context.executeAction(action, "Close the blocking dialog once.");
  await context.settleAfterAction(action);
  const snapshotAfter = await context.scanPage();

  context.recordStep({
    stepSummary: "Dialog close recovery attempted.",
    nextIntent: "Rescan the current page state.",
    expectedOutcome: "The blocking dialog disappears or the page becomes usable.",
    action,
    actionResult: result,
    snapshot: snapshotAfter,
  });

  context.appendLog("runtime", result.success ? "info" : "warn", "Dialog close recovery finished.", {
    success: result.success,
    recoveryTarget: result.recoveryTarget,
    pageReady: snapshotAfter.pageReady,
  });

  if (!result.success) {
    return undefined;
  }

  if (!hasRecoverableDialog(snapshotAfter) || snapshotAfter.pageReady.ready) {
    context.memory.recoveryHint = undefined;
    return snapshotAfter;
  }

  return undefined;
}

export async function ensureUsableSnapshotWithDialogRecovery(
  context: ToolExecutionContext,
  reason: string,
): Promise<SnapshotData> {
  const snapshot = await context.scanPage();
  if (snapshot.pageReady.ready) {
    return snapshot;
  }

  const recoveredBeforeWait = await attemptDialogCloseRecovery(context, snapshot, reason);
  if (recoveredBeforeWait?.pageReady.ready) {
    return recoveredBeforeWait;
  }

  try {
    return await context.ensureUsableSnapshot();
  } catch (error) {
    if (error instanceof RuntimeError && error.code === "PAGE_NOT_READY") {
      const latestSnapshot = context.memory.pageSnapshot;
      if (latestSnapshot) {
        const recoveredAfterWait = await attemptDialogCloseRecovery(context, latestSnapshot, reason);
        if (recoveredAfterWait) {
          if (recoveredAfterWait.pageReady.ready) {
            return recoveredAfterWait;
          }
          return await context.ensureUsableSnapshot();
        }
      }
    }

    throw error;
  }
}

export async function reopenCommerceSearchResults(
  context: ToolExecutionContext,
  taskSpec: CommerceTaskSpec,
  reason: string,
): Promise<SnapshotData | undefined> {
  if (context.memory.runtimeMeta.searchReopenRecoveryCount >= 1) {
    return undefined;
  }

  context.memory.runtimeMeta.searchReopenRecoveryCount += 1;
  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "NAVIGATE";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.searchReopenRecoveryCount}/1: reopen canonical search page.`;
  context.appendLog("runtime", "warn", "Triggering canonical search reopen recovery.", {
    reason,
    searchReopenRecoveryCount: context.memory.runtimeMeta.searchReopenRecoveryCount,
    url: buildCommerceSearchUrl(taskSpec),
  });

  const action: AgentAction = {
    type: "NAVIGATE",
    url: buildCommerceSearchUrl(taskSpec),
  };
  const result = await context.executeAction(action, "Reopen the canonical search results page once.");
  await context.settleAfterAction(action);
  const snapshotAfter = await ensureUsableSnapshotWithDialogRecovery(context, "Recover from an unusable search page.");

  context.recordStep({
    stepSummary: "Canonical search reopen attempted.",
    nextIntent: "Validate the search results page again.",
    expectedOutcome: "The canonical search results page becomes usable.",
    action,
    actionResult: result,
    snapshot: snapshotAfter,
  });

  return snapshotAfter;
}

export async function scrollForMoreCandidates(
  context: ToolExecutionContext,
  snapshot: SnapshotData,
  reason: string,
): Promise<{
  snapshot: SnapshotData;
  actionResult: ActionResult;
}> {
  const resultList = snapshot.pageFacts.resultList;
  if (!resultList?.present || resultList.emptyState) {
    throw new RuntimeError(reason, "NO_RECOVERABLE_RESULTS");
  }

  if (context.memory.runtimeMeta.recoveryCount >= LIMITS.MAX_RUNTIME_RECOVERY) {
    throw new RuntimeError(`${reason} Recovery limit reached.`, "RECOVERY_EXHAUSTED");
  }

  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "SCROLL";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.recoveryCount}: scroll for more candidates.`;
  context.appendLog("runtime", "warn", "Triggering tool-local scroll recovery.", {
    reason,
    recoveryCount: context.memory.runtimeMeta.recoveryCount,
    resultList,
  });

  const action: AgentAction = {
    type: "SCROLL",
    direction: "down",
    amount: 920,
  };
  const actionResult = await context.executeAction(action, "Scroll to load more result cards.");
  await context.settleAfterAction(action);
  const snapshotAfter = await context.scanPage();

  context.recordStep({
    stepSummary: "Scroll recovery completed.",
    nextIntent: "Extract the refreshed result list again.",
    expectedOutcome: "More product cards become visible.",
    action,
    actionResult,
    snapshot: snapshotAfter,
  });

  return {
    snapshot: snapshotAfter,
    actionResult,
  };
}

export function needsSearchReopen(snapshot: SnapshotData, expectedPageType: SnapshotData["pageType"]) {
  return snapshot.pageType !== expectedPageType || hasSearchPageStructureIssue(snapshot);
}
