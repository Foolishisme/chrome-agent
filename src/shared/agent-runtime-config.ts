export const LIMITS = {
  MAX_TOTAL_STEPS: 20,
  SOFT_STEP_LIMIT: 15,
  SOFT_ELAPSED_MS: 120_000,
  MAX_ELAPSED_MS: 180_000,
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

export interface ResearchRuntimePolicy {
  candidatePoolSize: number;
  defaultPageReadCount: number;
  pageReadConcurrency: number;
  pageBodyCharLimit: number;
  maxRuntimeRounds: number;
}

export const RESEARCH_RUNTIME_POLICY: ResearchRuntimePolicy = {
  candidatePoolSize: 5,
  defaultPageReadCount: 5,
  pageReadConcurrency: 2,
  pageBodyCharLimit: 2_000,
  maxRuntimeRounds: 2,
} as const;

export const DEFAULT_GOAL = "帮我调研一下 Playwright 和 Selenium 的区别，进入前 3 个页面总结";

export const DEFAULT_LOCALE = "zh-CN" as const;

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

export const RESEARCH_INTENT_KEYWORDS = ["调研", "研究", "查一下", "查一查", "搜一下", "搜索", "资料", "来源", "背景", "新闻", "公开信息"];
