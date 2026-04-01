import { SENSITIVE_KEYWORDS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type { AgentAction, LlmDecision, SessionMemory, SnapshotData, ToolResult } from "../shared/types";

const FALLBACK_AGENT_IDS = new Set(["el_search_input", "el_search_submit"]);

export function ensureAgentExists(snapshot: SnapshotData | undefined, agentId: string) {
  if (!snapshot) {
    throw new RuntimeError("当前没有页面快照，无法定位元素。", "SNAPSHOT_MISSING");
  }

  const matched = snapshot.interactiveElements.find((item) => item.agentId === agentId);
  if (matched) {
    return matched;
  }

  if (FALLBACK_AGENT_IDS.has(agentId) && (snapshot.pageType === "home" || snapshot.pageType === "search")) {
    return {
      agentId,
      role: agentId === "el_search_input" ? "input" : "button",
      text: "",
      tagName: "",
      isVisible: true,
      rect: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  throw new RuntimeError(`agentId 不存在：${agentId}`, "AGENT_ID_NOT_FOUND");
}

export function ensureActionAllowed(snapshot: SnapshotData | undefined, action: AgentAction) {
  if (action.type === "TYPE" || action.type === "CLICK") {
    const target = ensureAgentExists(snapshot, action.agentId);
    const combined = `${target.text} ${target.agentId}`.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((keyword) => combined.includes(keyword.toLowerCase()))) {
      throw new RuntimeError("命中敏感动作拦截规则。", "SENSITIVE_ACTION_BLOCKED");
    }
  }

  if (action.type === "EXTRACT_LIST" && snapshot?.pageType !== "search") {
    throw new RuntimeError("只有搜索结果页允许提取商品列表。", "INVALID_PAGE_FOR_EXTRACT");
  }
}

export function normalizeDecision(decision: LlmDecision): LlmDecision {
  if (decision.action.type === "DONE" && !decision.done) {
    return { ...decision, done: true };
  }
  return decision;
}

export function hasReachedCompletion(memory: SessionMemory, decision?: LlmDecision): boolean {
  const items =
    decision?.action.type === "DONE" && decision.action.items && decision.action.items.length > 0
      ? decision.action.items
      : memory.extractedItems;

  return items.length >= 3;
}

export function ensureDoneAllowed(memory: SessionMemory, decision: LlmDecision) {
  if (decision.action.type !== "DONE") {
    return;
  }

  if (memory.runtimeMeta.pageType !== "search") {
    throw new RuntimeError("当前页面阶段不允许结束任务。", "DONE_PAGE_BLOCKED");
  }

  if (!hasReachedCompletion(memory, decision)) {
    throw new RuntimeError("商品数量不足，不能提前结束任务。", "DONE_ITEMS_BLOCKED");
  }
}

function actionFingerprint(action?: AgentAction): string {
  if (!action) {
    return "none";
  }

  return JSON.stringify(action);
}

export function isRepeatedAction(memory: SessionMemory, action: AgentAction): boolean {
  const recent = memory.stepHistory.slice(-3);
  if (recent.length < 2) {
    return false;
  }

  return recent.every(
    (step) =>
      actionFingerprint(step.action) === actionFingerprint(action) &&
      step.actionResult?.success === false,
  );
}

export function summarizeSnapshot(snapshot: SnapshotData): string {
  const resultList = snapshot.pageFacts.resultList;
  const ready = snapshot.pageReady.ready ? "ready" : "not-ready";
  const searchFacts = snapshot.pageFacts.searchBox.present ? "search-input" : "no-search-input";
  const resultFacts = resultList ? `${resultList.cardCount} cards / ${resultList.productLinkCount} links` : "no-results";
  return `${snapshot.pageType} | ${ready} | ${searchFacts} | ${resultFacts}`;
}

export function compareExpectedOutcome(
  beforeSnapshot: SnapshotData | undefined,
  afterSnapshot: SnapshotData,
  expectedOutcome: string,
  action: AgentAction,
  actionResult?: ToolResult,
): {
  matched: boolean;
  reason: string;
} {
  if (action.type === "TYPE") {
    const before = beforeSnapshot?.pageFacts.searchBox.text ?? "";
    const after = afterSnapshot.pageFacts.searchBox.text ?? "";
    if (after.includes(action.text) || (before !== after && after.length > 0)) {
      return { matched: true, reason: "搜索框内容已更新。" };
    }
  }

  if (action.type === "CLICK") {
    if (beforeSnapshot?.url !== afterSnapshot.url || beforeSnapshot?.pageType !== afterSnapshot.pageType) {
      return { matched: true, reason: "点击后页面状态发生变化。" };
    }
  }

  if (action.type === "SCROLL") {
    return { matched: true, reason: "滚动动作已执行。" };
  }

  if (action.type === "EXTRACT_LIST") {
    const extractedCount = actionResult?.items?.length ?? 0;
    if (extractedCount > 0) {
      return {
        matched: true,
        reason: extractedCount >= 3 ? "已提取到足够商品。" : `已提取到 ${extractedCount} 个商品，仍可继续补充。`,
      };
    }

    if (!afterSnapshot.pageReady.ready) {
      return { matched: false, reason: "页面尚未就绪，提取结果暂不可用。" };
    }
  }

  if (expectedOutcome.trim().length > 0) {
    return { matched: false, reason: "未观察到与预期匹配的页面变化。" };
  }

  return { matched: true, reason: "没有设置额外的预期结果。" };
}
