import { DEFAULT_LOCALE } from "../shared/constants";
import type { PlanStepStatus, RuntimeStatus } from "../shared/types";

export type Locale = "zh-CN" | "en-US";

type MessageBundle = {
  appTitle: string;
  heroTitle: string;
  heroDescription: string;
  conversationTitle: string;
  runtimeStatusTitle: string;
  resultsTitle: string;
  goalPlaceholder: string;
  start: string;
  retry: string;
  stop: string;
  userGoal: string;
  assistantSummary: string;
  assistantWaiting: string;
  runtime: string;
  taskType: string;
  step: string;
  currentStepId: string;
  currentTool: string;
  elapsed: string;
  budget: string;
  session: string;
  items: string;
  sources: string;
  timelineTitle: string;
  timelineWaiting: string;
  timelineAction: string;
  timelineResult: string;
  timelineExpected: string;
  timelineSnapshot: string;
  logsTitle: string;
  logsEmpty: string;
  logDetail: string;
  planTitle: string;
  planTools: string;
  planCriteria: string;
  resultOk: string;
  resultFail: string;
  resultPartial: string;
  resultsHint: string;
  product: string;
  price: string;
  shop: string;
  summary: string;
  recommendation: string;
  unknownShop: string;
  unknownSummary: string;
  noItems: string;
  noSources: string;
  sourceSummary: string;
  sourceLink: string;
  sourcePoints: string;
  sourceIssues: string;
  emptyValue: string;
  budgetLow: string;
  budgetHealthy: string;
  taskTypeLabels: Record<"commerce_search" | "public_research", string>;
  statusLabels: Record<RuntimeStatus, string>;
  stepStatusLabels: Record<PlanStepStatus, string>;
};

const messages: Record<Locale, MessageBundle> = {
  "zh-CN": {
    appTitle: "Browser Agent MVP",
    heroTitle: "Browser Agent MVP",
    heroDescription: "当前界面按新范式展示：对话、运行状态和结果。",
    conversationTitle: "对话",
    runtimeStatusTitle: "运行状态",
    resultsTitle: "结果",
    goalPlaceholder: "输入购物或调研目标",
    start: "开始",
    retry: "重试",
    stop: "停止",
    userGoal: "用户目标",
    assistantSummary: "当前进展",
    assistantWaiting: "等待会话启动。",
    runtime: "运行状态",
    taskType: "任务类型",
    step: "执行步数",
    currentStepId: "当前步骤",
    currentTool: "当前工具",
    elapsed: "运行时间",
    budget: "预算状态",
    session: "会话",
    items: "结果数",
    sources: "来源数",
    timelineTitle: "执行时间线",
    timelineWaiting: "还没有执行记录。",
    timelineAction: "动作",
    timelineResult: "结果",
    timelineExpected: "预期",
    timelineSnapshot: "页面摘要",
    logsTitle: "调试日志",
    logsEmpty: "还没有调试日志。",
    logDetail: "详情",
    planTitle: "计划步骤",
    planTools: "可选工具",
    planCriteria: "成功标准",
    resultOk: "成功",
    resultFail: "失败",
    resultPartial: "部分成功",
    resultsHint: "会话完成后，结果会显示在这里。",
    product: "商品",
    price: "价格",
    shop: "店铺",
    summary: "摘要",
    recommendation: "推荐说明",
    unknownShop: "-",
    unknownSummary: "-",
    noItems: "还没有结果项。",
    noSources: "还没有来源结果。",
    sourceSummary: "来源摘要",
    sourceLink: "来源链接",
    sourcePoints: "来源要点",
    sourceIssues: "未解决问题",
    emptyValue: "-",
    budgetLow: "接近上限",
    budgetHealthy: "正常",
    taskTypeLabels: {
      commerce_search: "商城调研",
      public_research: "普通调研",
    },
    statusLabels: {
      idle: "空闲",
      scanning: "扫描中",
      planning: "规划中",
      acting: "执行中",
      observing: "观察中",
      done: "已完成",
      error: "异常",
    },
    stepStatusLabels: {
      pending: "待执行",
      running: "执行中",
      succeeded: "已完成",
      failed: "失败",
      blocked: "阻塞",
    },
  },
  "en-US": {
    appTitle: "Browser Agent MVP",
    heroTitle: "Browser Agent MVP",
    heroDescription: "The side panel now focuses on conversation, runtime state, and results.",
    conversationTitle: "Conversation",
    runtimeStatusTitle: "Runtime State",
    resultsTitle: "Results",
    goalPlaceholder: "Describe a shopping or research goal",
    start: "Start",
    retry: "Retry",
    stop: "Stop",
    userGoal: "User Goal",
    assistantSummary: "Current Progress",
    assistantWaiting: "Waiting for session start.",
    runtime: "Runtime",
    taskType: "Task Type",
    step: "Executed Steps",
    currentStepId: "Current Step",
    currentTool: "Current Tool",
    elapsed: "Elapsed",
    budget: "Budget",
    session: "Session",
    items: "Items",
    sources: "Sources",
    timelineTitle: "Execution Timeline",
    timelineWaiting: "No execution records yet.",
    timelineAction: "Action",
    timelineResult: "Result",
    timelineExpected: "Expected",
    timelineSnapshot: "Page Summary",
    logsTitle: "Debug Logs",
    logsEmpty: "No debug logs yet.",
    logDetail: "Detail",
    planTitle: "Plan Steps",
    planTools: "Allowed Tools",
    planCriteria: "Success Criteria",
    resultOk: "OK",
    resultFail: "FAIL",
    resultPartial: "PARTIAL",
    resultsHint: "Results will appear here after the session completes.",
    product: "Product",
    price: "Price",
    shop: "Shop",
    summary: "Summary",
    recommendation: "Recommendation",
    unknownShop: "-",
    unknownSummary: "-",
    noItems: "No items yet.",
    noSources: "No source results yet.",
    sourceSummary: "Source Summary",
    sourceLink: "Source Link",
    sourcePoints: "Source Points",
    sourceIssues: "Unresolved Issues",
    emptyValue: "-",
    budgetLow: "Low",
    budgetHealthy: "Healthy",
    taskTypeLabels: {
      commerce_search: "Commerce Research",
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
    stepStatusLabels: {
      pending: "Pending",
      running: "Running",
      succeeded: "Succeeded",
      failed: "Failed",
      blocked: "Blocked",
    },
  },
};

export function getMessages(locale: Locale = DEFAULT_LOCALE): MessageBundle {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}
