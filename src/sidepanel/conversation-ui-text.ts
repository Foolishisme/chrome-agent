import { getMessages } from "./sidepanel-message-catalog";

export const messages = getMessages();

export const conversationUiText = {
  currentConversation: "当前会话",
  newConversation: "新建会话",
  conversationHistoryEmpty: "还没有历史会话。",
  conversationTurnsEmpty: "当前会话还没有历史内容。",
  userTurn: "提问",
  assistantTurn: "回答",
  rollbackTurn: "回退到此轮",
  deleteConversation: "删除会话",
  createConversationReady: "已创建新会话。",
  createConversationFailed: "创建新会话失败。",
  deleteConversationReady: "已删除当前会话。",
  deleteConversationFailed: "删除当前会话失败。",
  selectConversationFailed: "切换历史会话失败。",
  rollbackConversationReady: "已回退到选中轮次。",
  rollbackConversationFailed: "回退会话失败。",
  untitledConversation: "未命名会话",
};

export const conversationInputPlaceholder = "你想知道什么";
export const emptyGoalNotice = "请先输入问题。";
export const optimisticAssistantProgressText = navigator.language.startsWith("zh")
  ? "正在理解问题并启动会话..."
  : "Understanding the question and starting the session...";

export type Messages = typeof messages;
export type ConversationUiText = typeof conversationUiText;
