import { DEFAULT_LOCALE } from "../shared/constants";

export type Locale = "zh-CN" | "en-US";

type MessageBundle = {
  heroTitle: string;
  heroDescription: string;
  conversationTitle: string;
  resultsTitle: string;
  searchToggleLabel: string;
  searchToggleHintAuto: string;
  searchToggleHintPreferSearch: string;
  start: string;
  stop: string;
  assistantWaiting: string;
  resultsHint: string;
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
};

const messages: Record<Locale, MessageBundle> = {
  "zh-CN": {
    heroTitle: "智能浏览助手",
    heroDescription: "告诉我你的目标，我来替你检索网页、阅读内容并汇总结论。",
    conversationTitle: "对话",
    resultsTitle: "结果",
    searchToggleLabel: "优先搜索",
    searchToggleHintAuto: "当前为智能回答；点击后遇到边界问题会优先搜索。",
    searchToggleHintPreferSearch: "当前为优先搜索；点击后恢复智能回答。",
    start: "开始",
    stop: "停止",
    assistantWaiting: "等待会话启动。",
    resultsHint: "会话完成后，结果会显示在这里。",
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
  },
  "en-US": {
    heroTitle: "Browser Agent",
    heroDescription: "Tell me your goal, and I'll search, read, and summarize the web for you.",
    conversationTitle: "Conversation",
    resultsTitle: "Results",
    searchToggleLabel: "Prefer Search",
    searchToggleHintAuto: "Auto mode. Click to prefer search for ambiguous goals.",
    searchToggleHintPreferSearch: "Prefer-search mode. Click to return to auto mode.",
    start: "Start",
    stop: "Stop",
    assistantWaiting: "Waiting for session start.",
    resultsHint: "Results will appear here after the session completes.",
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
  },
};

export function getMessages(locale: Locale = DEFAULT_LOCALE): MessageBundle {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}
