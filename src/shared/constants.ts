export const LIMITS = {
  MAX_STEPS: 10,
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
} as const;

export const DEFAULT_GOAL = "帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐";

export const DEFAULT_LOCALE = "zh-CN" as const;

export const ALLOWED_HOSTS = new Set(["www.jd.com", "search.jd.com"]);

export const SENSITIVE_KEYWORDS = ["购物车", "购买", "立即购买", "提交订单", "去结算", "支付"];

export const DEFAULT_PLAN = ["解析任务并生成搜索词", "执行站内搜索", "提取搜索结果", "过滤候选商品", "生成最终推荐"];

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
