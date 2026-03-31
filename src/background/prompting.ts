import type { PlanningResult, SessionMemory, SnapshotData } from "../shared/types";

function describeSnapshot(snapshot?: SnapshotData): string {
  if (!snapshot) {
    return "No snapshot available yet.";
  }

  const interactive = snapshot.interactiveElements
    .map((item) => `${item.agentId}(${item.role}): ${item.text || item.tagName}`)
    .slice(0, 8);

  const products = snapshot.productCandidates
    .map((item, index) => `${index + 1}. ${item.title} | ${item.priceText} | ${item.shopText ?? "未知店铺"}`)
    .slice(0, 5);

  return JSON.stringify(
    {
      url: snapshot.url,
      title: snapshot.title,
      pageType: snapshot.pageType,
      interactiveElements: interactive,
      productCandidates: products,
    },
    null,
    2,
  );
}

export function buildPlanningPrompt(memory: SessionMemory): string {
  return [
    "你是浏览器购物 Agent 的计划器。",
    "请基于用户目标和当前页面快照，输出 2 到 4 步的简短计划，严格返回 JSON。",
    "不要输出 Markdown，不要解释。",
    "返回格式：{\"plan\":[\"步骤1\",\"步骤2\"]}",
    `用户目标：${memory.goal}`,
    `当前快照：${describeSnapshot(memory.pageSnapshot)}`,
  ].join("\n");
}

export function buildDecisionPrompt(memory: SessionMemory): string {
  const recentSteps = memory.stepHistory.slice(-4).map((step) => ({
    step: step.step,
    status: step.status,
    summary: step.stepSummary,
    nextIntent: step.nextIntent,
    action: step.action,
    result: step.actionResult,
  }));

  return [
    "你是浏览器购物 Agent 的决策器。",
    "你必须严格返回 JSON，不要输出 Markdown，不要解释。",
    "只允许以下 action:",
    '1. {"type":"CLICK","agentId":"..."}',
    '2. {"type":"TYPE","agentId":"...","text":"...","submit":true|false}',
    '3. {"type":"SCROLL","direction":"up|down","amount":number}',
    '4. {"type":"EXTRACT_LIST"}',
    '5. {"type":"DONE","summary":"...","items":[...]}',
    "当信息还不够时，不要提前 DONE。",
    "当已经拿到至少 3 个商品且信息足够比较时，可以 DONE。",
    "如果当前在首页，应优先定位搜索框并输入更简短的搜索词。",
    "如果当前在搜索页且还没有提取商品，应优先 EXTRACT_LIST。",
    "如果 EXTRACT_LIST 已拿到商品，则 DONE 并给出简短推荐理由。",
    "返回格式：",
    JSON.stringify(
      {
        stepSummary: "当前阶段要做什么",
        nextIntent: "下一步的意图",
        expectedOutcome: "执行后预期会发生什么变化",
        action: { type: "TYPE", agentId: "el_search_input", text: "5000元 笔记本电脑", submit: false },
        done: false,
      },
      null,
      2,
    ),
    `用户目标：${memory.goal}`,
    `当前计划：${JSON.stringify(memory.plan.length > 0 ? memory.plan : ["先识别页面，再完成搜索和提取"])}`,
    `最近步骤：${JSON.stringify(recentSteps, null, 2)}`,
    `已提取商品：${JSON.stringify(memory.extractedItems.slice(0, 5), null, 2)}`,
    `当前快照：${describeSnapshot(memory.pageSnapshot)}`,
    `当前意图：${memory.nextIntent ?? "尚未设置"}`,
    `最近错误：${memory.lastError ?? "无"}`,
  ].join("\n");
}

export function normalizePlanningResult(result: PlanningResult): PlanningResult {
  return {
    plan: result.plan.map((item) => item.trim()).filter(Boolean).slice(0, 4),
  };
}
