import { DEFAULT_LOCALE } from "../shared/constants";
import type { RuntimeStatus } from "../shared/types";

export type Locale = "zh-CN" | "en-US";

type MessageBundle = {
  appTitle: string;
  heroTitle: string;
  heroDescription: string;
  sessionTitle: string;
  goalPlaceholder: string;
  start: string;
  retry: string;
  stop: string;
  statusTitle: string;
  runtime: string;
  step: string;
  items: string;
  rawItems: string;
  session: string;
  timelineTitle: string;
  timelineWaiting: string;
  timelinePlan: string;
  timelineAction: string;
  timelineResult: string;
  timelineExpected: string;
  timelineSteps: string;
  timelineSnapshot: string;
  resultOk: string;
  resultFail: string;
  resultsTitle: string;
  product: string;
  price: string;
  shop: string;
  summary: string;
  recommendation: string;
  noItems: string;
  resultsHint: string;
  unknownShop: string;
  unknownSummary: string;
  logsTitle: string;
  logsEmpty: string;
  logDetail: string;
  debugTitle: string;
  pageTitle: string;
  pageType: string;
  pageReady: string;
  pageReadyReason: string;
  pageChecks: string;
  searchBox: string;
  searchButton: string;
  resultList: string;
  queryTitle: string;
  querySource: string;
  queryCategory: string;
  queryBudget: string;
  queryTopK: string;
  querySearch: string;
  filterTitle: string;
  filterBudget: string;
  filterFinal: string;
  recoveryTitle: string;
  recoveryEmpty: string;
  emptyValue: string;
  statusLabels: Record<RuntimeStatus, string>;
};

const messages: Record<Locale, MessageBundle> = {
  "zh-CN": {
    appTitle: "浏览器 Agent MVP",
    heroTitle: "浏览器 Agent MVP",
    heroDescription: "规则主线：解析目标、编译搜索词、提取结果、过滤候选，再由模型生成最终推荐。",
    sessionTitle: "任务会话",
    goalPlaceholder: "输入购物目标",
    start: "开始",
    retry: "重试",
    stop: "停止",
    statusTitle: "运行状态",
    runtime: "运行态",
    step: "步骤",
    items: "结果数",
    rawItems: "原始候选",
    session: "会话",
    timelineTitle: "执行时间线",
    timelineWaiting: "等待任务启动。",
    timelinePlan: "计划",
    timelineAction: "动作",
    timelineResult: "结果",
    timelineExpected: "预期",
    timelineSteps: "步",
    timelineSnapshot: "快照摘要",
    resultOk: "成功",
    resultFail: "失败",
    resultsTitle: "结果对比",
    product: "商品",
    price: "价格",
    shop: "店铺",
    summary: "摘要",
    recommendation: "推荐理由",
    noItems: "还没有提取到商品。",
    resultsHint: "提取并过滤到足够商品后，这里会展示结构化结果和最终推荐。",
    unknownShop: "-",
    unknownSummary: "-",
    logsTitle: "调试日志",
    logsEmpty: "还没有日志。",
    logDetail: "详情",
    debugTitle: "页面调试",
    pageTitle: "页面",
    pageType: "页面类型",
    pageReady: "页面可用",
    pageReadyReason: "原因",
    pageChecks: "检查项",
    searchBox: "搜索框",
    searchButton: "搜索按钮",
    resultList: "结果列表",
    queryTitle: "结构化任务",
    querySource: "搜索词来源",
    queryCategory: "品类",
    queryBudget: "预算",
    queryTopK: "目标数量",
    querySearch: "搜索词",
    filterTitle: "过滤诊断",
    filterBudget: "预算范围",
    filterFinal: "最终保留",
    recoveryTitle: "恢复状态",
    recoveryEmpty: "当前没有恢复分支。",
    emptyValue: "-",
    statusLabels: {
      idle: "空闲",
      scanning: "扫描中",
      planning: "规划中",
      acting: "执行中",
      observing: "观察中",
      done: "已完成",
      error: "出错",
    },
  },
  "en-US": {
    appTitle: "Browser Agent MVP",
    heroTitle: "Browser Agent MVP",
    heroDescription: "Rule-first flow: compile query, extract results, filter candidates, then let the model write the final recommendation.",
    sessionTitle: "Session",
    goalPlaceholder: "Describe the shopping goal",
    start: "Start",
    retry: "Retry",
    stop: "Stop",
    statusTitle: "Status",
    runtime: "Runtime",
    step: "Step",
    items: "Items",
    rawItems: "Raw Items",
    session: "Session",
    timelineTitle: "Timeline",
    timelineWaiting: "Waiting for session start.",
    timelinePlan: "Plan",
    timelineAction: "Action",
    timelineResult: "Result",
    timelineExpected: "Expected",
    timelineSteps: "steps",
    timelineSnapshot: "Snapshot",
    resultOk: "OK",
    resultFail: "FAIL",
    resultsTitle: "Results",
    product: "Product",
    price: "Price",
    shop: "Shop",
    summary: "Summary",
    recommendation: "Recommendation",
    noItems: "No extracted items yet.",
    resultsHint: "Filtered products and recommendation will appear here once enough candidates are available.",
    unknownShop: "-",
    unknownSummary: "-",
    logsTitle: "Debug Logs",
    logsEmpty: "No logs yet.",
    logDetail: "Detail",
    debugTitle: "Page Debug",
    pageTitle: "Page",
    pageType: "Page Type",
    pageReady: "Usable",
    pageReadyReason: "Reason",
    pageChecks: "Checks",
    searchBox: "Search Box",
    searchButton: "Search Button",
    resultList: "Result List",
    queryTitle: "Structured Task",
    querySource: "Query Source",
    queryCategory: "Category",
    queryBudget: "Budget",
    queryTopK: "Top K",
    querySearch: "Search Query",
    filterTitle: "Filter Diagnostics",
    filterBudget: "Budget Range",
    filterFinal: "Final Count",
    recoveryTitle: "Recovery",
    recoveryEmpty: "No active recovery branch.",
    emptyValue: "-",
    statusLabels: {
      idle: "Idle",
      scanning: "Scanning",
      planning: "Planning",
      acting: "Acting",
      observing: "Observing",
      done: "Done",
      error: "Error",
    },
  },
};

export function getMessages(locale: Locale = DEFAULT_LOCALE): MessageBundle {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}
