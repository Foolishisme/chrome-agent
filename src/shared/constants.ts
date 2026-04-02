import type { TaskType } from "./types";

export const LIMITS = {
  MAX_STEPS: 16,
  MAX_LLM_RETRIES: 3,
  MAX_ACTION_RETRIES: 2,
  LLM_TIMEOUT_MS: 30_000,
  ACTION_TIMEOUT_MS: 10_000,
  SNAPSHOT_RETRIES: 3,
  SNAPSHOT_RETRY_DELAY_MS: 500,
  PAGE_READY_RETRIES: 1,
  PAGE_READY_WAIT_MS: 1_000,
  PAGE_READY_SECOND_WAIT_MS: 500,
  MAX_RUNTIME_RECOVERY: 2,
  PAGE_TEXT_MIN_LENGTH: 200,
} as const;

export const DEFAULT_GOAL = "帮我调研一下 Playwright 和 Selenium 的区别，进入前 3 个页面总结";

export const DEFAULT_LOCALE = "zh-CN" as const;

export const SENSITIVE_KEYWORDS = ["购物车", "购买", "立即购买", "提交订单", "去结算", "支付"];

export const DEFAULT_PLANS: Record<TaskType, string[]> = {
  commerce_search: ["解析任务并生成搜索词", "执行站内搜索", "提取搜索结果", "过滤候选商品", "统一汇总并输出结果"],
  public_research: ["解析调研任务并生成查询词", "打开 Google 搜索结果页", "提取第一页自然结果", "筛选候选来源", "逐页读取来源并提取事实", "统一汇总并输出结果"],
};

export const KNOWN_CATEGORY_KEYWORDS = [
  "笔记本电脑",
  "游戏本",
  "轻薄本",
  "MacBook",
  "手机",
  "耳机",
  "显示器",
  "平板",
  "路由器",
  "显卡",
  "相机",
  "电视",
  "冰箱",
  "空调",
  "洗衣机",
];

export const RESEARCH_INTENT_KEYWORDS = ["调研", "研究", "总结", "资料", "来源", "背景", "区别", "优缺点", "是什么"];
