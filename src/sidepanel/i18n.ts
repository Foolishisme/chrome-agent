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
  searchToggleLabel: string;
  searchToggleHintAuto: string;
  searchToggleHintPreferSearch: string;
  start: string;
  retry: string;
  stop: string;
  extractCurrentPage: string;
  clearExtractedSamples: string;
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
  runtimeDetailsTitle: string;
  planTitle: string;
  planTools: string;
  planCriteria: string;
  resultOk: string;
  resultFail: string;
  resultPartial: string;
  resultBlocked: string;
  resultsHint: string;
  resultSummaryTitle: string;
  resultCopyButton: string;
  resultDocumentsTitle: string;
  resultCopyReady: string;
  resultCopyFailed: string;
  resultCopyUnavailable: string;
  documentCopyButton: string;
  documentDownloadButton: string;
  documentEmpty: string;
  downloadReady: string;
  downloadFailed: string;
  resultItemsTitle: string;
  resultSourcesTitle: string;
  resultIssuesTitle: string;
  resultNextActionTitle: string;
  product: string;
  price: string;
  shop: string;
  summary: string;
  recommendation: string;
  unknownShop: string;
  unknownSummary: string;
  noItems: string;
  noSources: string;
  sourceExcerpt: string;
  sourceLink: string;
  sourceIssues: string;
  manualSamplesTitle: string;
  manualSamplesHint: string;
  manualSamplesEmpty: string;
  manualSampleStatus: string;
  manualSampleStrategy: string;
  manualSampleUrl: string;
  manualSampleTextLength: string;
  manualSampleReason: string;
  manualSampleReadable: string;
  manualSampleParagraphs: string;
  manualSampleSaved: string;
  manualSampleSaveFailed: string;
  manualSampleClearReady: string;
  manualSampleClearFailed: string;
  emptyValue: string;
  budgetLow: string;
  budgetHealthy: string;
  taskTypeLabels: Record<"direct_answer" | "commerce_search" | "public_research", string>;
  statusLabels: Record<RuntimeStatus, string>;
  stepStatusLabels: Record<PlanStepStatus, string>;
};

const messages: Record<Locale, MessageBundle> = {
  "zh-CN": {
    appTitle: "智能浏览助手",
    heroTitle: "智能浏览助手",
    heroDescription: "告诉我你的目标，我来替你检索网页、阅读内容并汇总结果。",
    conversationTitle: "对话",
    runtimeStatusTitle: "运行状态",
    resultsTitle: "结果",
    goalPlaceholder: "输入购物或调研目标",
    searchToggleLabel: "优先搜索",
    searchToggleHintAuto: "当前为智能回答；点击后遇到边界问题会优先搜索。",
    searchToggleHintPreferSearch: "当前为优先搜索；点击后恢复智能回答。",
    start: "开始",
    retry: "重试",
    stop: "停止",
    extractCurrentPage: "提取当前页",
    clearExtractedSamples: "清空样本",
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
    runtimeDetailsTitle: "运行细节",
    planTitle: "计划步骤",
    planTools: "允许工具",
    planCriteria: "成功标准",
    resultOk: "成功",
    resultFail: "失败",
    resultPartial: "部分成功",
    resultBlocked: "阻塞",
    resultsHint: "会话完成后，结果会显示在这里。",
    resultSummaryTitle: "结果摘要",
    resultCopyButton: "复制结果",
    resultDocumentsTitle: "文档产物",
    resultCopyReady: "已复制到剪贴板。",
    resultCopyFailed: "复制失败，请检查浏览器剪贴板权限。",
    resultCopyUnavailable: "当前没有可复制的结果内容。",
    documentCopyButton: "复制文档",
    documentDownloadButton: "下载文档",
    documentEmpty: "还没有文档产物。",
    downloadReady: "下载已触发。",
    downloadFailed: "下载失败，请稍后重试。",
    resultItemsTitle: "候选项",
    resultSourcesTitle: "来源详情",
    resultIssuesTitle: "问题与阻塞",
    resultNextActionTitle: "建议下一步",
    product: "商品",
    price: "价格",
    shop: "店铺",
    summary: "摘要",
    recommendation: "推荐说明",
    unknownShop: "-",
    unknownSummary: "-",
    noItems: "还没有候选项。",
    noSources: "还没有来源结果。",
    sourceExcerpt: "来源正文片段",
    sourceLink: "来源链接",
    sourceIssues: "未解决问题",
    manualSamplesTitle: "本地提取样本",
    manualSamplesHint: "打开任意网页后点击“提取当前页”，结果会保存在本地，方便连续对比 10 个页面。",
    manualSamplesEmpty: "还没有本地提取样本。",
    manualSampleStatus: "提取状态",
    manualSampleStrategy: "提取策略",
    manualSampleUrl: "页面链接",
    manualSampleTextLength: "正文长度",
    manualSampleReason: "问题原因",
    manualSampleReadable: "可读性",
    manualSampleParagraphs: "段落数",
    manualSampleSaved: "当前页面提取结果已保存到本地。",
    manualSampleSaveFailed: "当前页面提取失败，请检查页面是否可读和可执行。",
    manualSampleClearReady: "本地提取样本已清空。",
    manualSampleClearFailed: "清空本地提取样本失败。",
    emptyValue: "-",
    budgetLow: "接近上限",
    budgetHealthy: "正常",
    taskTypeLabels: {
      direct_answer: "直接回答",
      commerce_search: "商城调研",
      public_research: "公网调研",
    },
    statusLabels: {
      idle: "空闲",
      running: "运行中",
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
    appTitle: "Browser Agent",
    heroTitle: "Browser Agent",
    heroDescription: "Tell me your goal, and I'll search, read, and summarize the web for you.",
    conversationTitle: "Conversation",
    runtimeStatusTitle: "Runtime State",
    resultsTitle: "Results",
    goalPlaceholder: "Describe a shopping or research goal",
    searchToggleLabel: "Prefer Search",
    searchToggleHintAuto: "Auto mode. Click to prefer search for ambiguous goals.",
    searchToggleHintPreferSearch: "Prefer-search mode. Click to return to auto mode.",
    start: "Start",
    retry: "Retry",
    stop: "Stop",
    extractCurrentPage: "Extract Page",
    clearExtractedSamples: "Clear Samples",
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
    runtimeDetailsTitle: "Runtime Details",
    planTitle: "Plan Steps",
    planTools: "Allowed Tools",
    planCriteria: "Success Criteria",
    resultOk: "OK",
    resultFail: "FAIL",
    resultPartial: "PARTIAL",
    resultBlocked: "BLOCKED",
    resultsHint: "Results will appear here after the session completes.",
    resultSummaryTitle: "Result Summary",
    resultCopyButton: "Copy Result",
    resultDocumentsTitle: "Documents",
    resultCopyReady: "Copied to clipboard.",
    resultCopyFailed: "Copy failed. Check clipboard permissions.",
    resultCopyUnavailable: "There is no result content to copy yet.",
    documentCopyButton: "Copy Document",
    documentDownloadButton: "Download Document",
    documentEmpty: "No document artifacts yet.",
    downloadReady: "Download started.",
    downloadFailed: "Download failed. Try again later.",
    resultItemsTitle: "Items",
    resultSourcesTitle: "Sources",
    resultIssuesTitle: "Issues & Blockers",
    resultNextActionTitle: "Suggested Next Action",
    product: "Product",
    price: "Price",
    shop: "Shop",
    summary: "Summary",
    recommendation: "Recommendation",
    unknownShop: "-",
    unknownSummary: "-",
    noItems: "No items yet.",
    noSources: "No source results yet.",
    sourceExcerpt: "Source Excerpt",
    sourceLink: "Source Link",
    sourceIssues: "Unresolved Issues",
    manualSamplesTitle: "Local Extraction Samples",
    manualSamplesHint: "Open any page and extract it. Results are stored locally for comparison.",
    manualSamplesEmpty: "No local extraction samples yet.",
    manualSampleStatus: "Extraction Status",
    manualSampleStrategy: "Strategy",
    manualSampleUrl: "Page URL",
    manualSampleTextLength: "Text Length",
    manualSampleReason: "Reason",
    manualSampleReadable: "Readable",
    manualSampleParagraphs: "Paragraphs",
    manualSampleSaved: "Saved the current page extraction locally.",
    manualSampleSaveFailed: "Failed to extract the current page.",
    manualSampleClearReady: "Local extraction samples were cleared.",
    manualSampleClearFailed: "Failed to clear local extraction samples.",
    emptyValue: "-",
    budgetLow: "Low",
    budgetHealthy: "Healthy",
    taskTypeLabels: {
      direct_answer: "Direct Answer",
      commerce_search: "Commerce Research",
      public_research: "Public Research",
    },
    statusLabels: {
      idle: "Idle",
      running: "Running",
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
