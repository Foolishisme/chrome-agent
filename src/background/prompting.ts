import type { ExtractedItem, SearchTaskSpec } from "../shared/types";

export function buildSearchQueryRefinementPrompt(goal: string, draftQuery: string) {
  return [
    "你是电商搜索关键词补全器。",
    "请只输出 JSON，不要输出 Markdown，不要解释。",
    "目标：补全一个适合站内搜索的短查询词。",
    "要求：",
    "- 保留明确品类",
    "- 有预算时保留预算信息",
    "- 不要加入推荐理由、排序条件或无关形容词",
    '- 返回格式：{"searchQuery":"...","reason":"..."}',
    `用户目标：${goal}`,
    `规则生成的初始搜索词：${draftQuery}`,
  ].join("\n");
}

export function buildFinalSummaryPrompt(goal: string, taskSpec: SearchTaskSpec, items: ExtractedItem[]) {
  return [
    "你是购物结果总结器。",
    "请只输出 JSON，不要输出 Markdown，不要解释。",
    "请基于已提取商品，写一段简短中文推荐说明。",
    "要求：",
    "- 只根据给定商品信息总结",
    "- 优先考虑预算匹配、价格和简短卖点",
    "- 长度控制在 2 到 4 句",
    '- 返回格式：{"summary":"..."}',
    `用户目标：${goal}`,
    `结构化任务：${JSON.stringify(taskSpec, null, 2)}`,
    `候选商品：${JSON.stringify(items, null, 2)}`,
  ].join("\n");
}
