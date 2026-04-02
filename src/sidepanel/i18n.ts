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
  taskType: string;
  step: string;
  items: string;
  rawItems: string;
  sources: string;
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
  resultPartial: string;
  resultsTitle: string;
  product: string;
  price: string;
  shop: string;
  summary: string;
  sourceSummary: string;
  sourceLink: string;
  sourcePoints: string;
  sourceIssues: string;
  recommendation: string;
  noItems: string;
  noSources: string;
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
  querySearchEngine: string;
  filterTitle: string;
  filterBudget: string;
  filterFinal: string;
  recoveryTitle: string;
  recoveryEmpty: string;
  issuesTitle: string;
  issuesEmpty: string;
  emptyValue: string;
  taskTypeLabels: Record<"commerce_search" | "public_research", string>;
  statusLabels: Record<RuntimeStatus, string>;
};

const messages: Record<Locale, MessageBundle> = {
  "zh-CN": {
    appTitle: "浏览器 Agent MVP",
    heroTitle: "浏览器 Agent MVP",
    heroDescription: "规则主线：解析目标、编译查询、提取候选、过滤结果，再统一汇总最终输出。",
    sessionTitle: "任务会话",
    goalPlaceholder: "输入购物或调研目标",
    start: "开始",
    retry: "重试",
    stop: "停止",
    statusTitle: "运行状态",
    runtime: "运行态",
    taskType: "任务类型",
    step: "步骤",
    items: "结果数",
    rawItems: "原始候选",
    sources: "来源数",
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
    resultPartial: "部分成功",
    resultsTitle: "最终结果",
    product: "商品",
    price: "价格",
    shop: "店铺",
    summary: "摘要",
    sourceSummary: "来源摘要",
    sourceLink: "来源链接",
    sourcePoints: "来源要点",
    sourceIssues: "未解决问题",
    recommendation: "推荐理由",
    noItems: "还没有提取到商品。",
    noSources: "还没有来源结果。",
    resultsHint: "任务完成后，这里会展示最终 Markdown 和结构化结果。",
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
    querySearchEngine: "搜索引擎",
    filterTitle: "过滤诊断",
    filterBudget: "预算范围",
    filterFinal: "最终保留",
    recoveryTitle: "恢复状态",
    recoveryEmpty: "当前没有恢复分支。",
    issuesTitle: "未解决问题",
    issuesEmpty: "当前没有未解决问题。",
    emptyValue: "-",
    taskTypeLabels: {
      commerce_search: "商品搜索",
      public_research: "公网调研",
    },
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
    heroDescription: "Rule-first flow: compile query, extract candidates, filter them, then aggregate the final output.",
    sessionTitle: "Session",
    goalPlaceholder: "Describe a shopping or research goal",
    start: "Start",
    retry: "Retry",
    stop: "Stop",
    statusTitle: "Status",
    runtime: "Runtime",
    taskType: "Task Type",
    step: "Step",
    items: "Items",
    rawItems: "Raw Items",
    sources: "Sources",
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
    resultPartial: "PARTIAL",
    resultsTitle: "Results",
    product: "Product",
    price: "Price",
    shop: "Shop",
    summary: "Summary",
    sourceSummary: "Source Summary",
    sourceLink: "Source Link",
    sourcePoints: "Source Points",
    sourceIssues: "Issues",
    recommendation: "Recommendation",
    noItems: "No extracted items yet.",
    noSources: "No source results yet.",
    resultsHint: "Final markdown and structured results will appear here after aggregation.",
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
    querySearchEngine: "Search Engine",
    filterTitle: "Filter Diagnostics",
    filterBudget: "Budget Range",
    filterFinal: "Final Count",
    recoveryTitle: "Recovery",
    recoveryEmpty: "No active recovery branch.",
    issuesTitle: "Unresolved Issues",
    issuesEmpty: "No unresolved issues.",
    emptyValue: "-",
    taskTypeLabels: {
      commerce_search: "Commerce Search",
      public_research: "Public Research",
    },
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
