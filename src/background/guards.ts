import { SENSITIVE_KEYWORDS } from "../shared/constants";
import type { AgentAction, LlmDecision, SessionMemory, SnapshotData } from "../shared/types";
import { RuntimeError } from "../shared/errors";

export function ensureAgentExists(snapshot: SnapshotData | undefined, agentId: string) {
  if (!snapshot) {
    throw new RuntimeError("当前没有页面快照，无法定位元素", "SNAPSHOT_MISSING");
  }

  const matched = snapshot.interactiveElements.find((item) => item.agentId === agentId);
  if (!matched) {
    throw new RuntimeError(`agentId 不存在: ${agentId}`, "AGENT_ID_NOT_FOUND");
  }
  return matched;
}

export function ensureActionAllowed(snapshot: SnapshotData | undefined, action: AgentAction) {
  if (action.type === "TYPE" || action.type === "CLICK") {
    const target = ensureAgentExists(snapshot, action.agentId);
    const combined = `${target.text} ${target.agentId}`.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((keyword) => combined.includes(keyword.toLowerCase()))) {
      throw new RuntimeError("命中敏感动作拦截规则", "SENSITIVE_ACTION_BLOCKED");
    }
  }

  if (action.type === "EXTRACT_LIST" && snapshot?.pageType !== "search") {
    throw new RuntimeError("只有搜索结果页允许提取商品列表", "INVALID_PAGE_FOR_EXTRACT");
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
    throw new RuntimeError("当前页面阶段不允许结束任务", "DONE_PAGE_BLOCKED");
  }

  if (!hasReachedCompletion(memory, decision)) {
    throw new RuntimeError("商品数量不足，不能提前 DONE", "DONE_ITEMS_BLOCKED");
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
  return `${snapshot.pageType} | ${snapshot.interactiveElements.length} elements | ${snapshot.productCandidates.length} products`;
}

export function compareExpectedOutcome(
  beforeSnapshot: SnapshotData | undefined,
  afterSnapshot: SnapshotData,
  expectedOutcome: string,
  action: AgentAction,
): {
  matched: boolean;
  reason: string;
} {
  if (action.type === "TYPE") {
    const before = beforeSnapshot?.interactiveElements.find((item) => item.agentId === action.agentId)?.text ?? "";
    const after = afterSnapshot.interactiveElements.find((item) => item.agentId === action.agentId)?.text ?? "";
    if (after.includes(action.text) || (before !== after && after.length > 0)) {
      return { matched: true, reason: "输入框值已更新" };
    }
  }

  if (action.type === "CLICK") {
    if (beforeSnapshot?.url !== afterSnapshot.url || beforeSnapshot?.pageType !== afterSnapshot.pageType) {
      return { matched: true, reason: "点击后页面状态发生变化" };
    }
  }

  if (action.type === "SCROLL") {
    return { matched: true, reason: "滚动动作已执行" };
  }

  if (action.type === "EXTRACT_LIST") {
    if (afterSnapshot.productCandidates.length >= 3) {
      return { matched: true, reason: "已提取足够商品" };
    }
  }

  if (expectedOutcome.trim().length > 0) {
    return { matched: false, reason: "未观测到与预期匹配的页面变化" };
  }

  return { matched: true, reason: "无明确预期结果要求" };
}
