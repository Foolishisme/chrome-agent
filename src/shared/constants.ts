export const LIMITS = {
  MAX_STEPS: 10,
  MAX_LLM_RETRIES: 3,
  MAX_ACTION_RETRIES: 2,
  LLM_TIMEOUT_MS: 30_000,
  ACTION_TIMEOUT_MS: 10_000,
  SNAPSHOT_RETRIES: 5,
  SNAPSHOT_RETRY_DELAY_MS: 800,
  PAGE_READY_RETRIES: 3,
  PAGE_READY_WAIT_MS: 1_000,
  MAX_RUNTIME_RECOVERY: 2,
} as const;

export const DEFAULT_GOAL = "帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐";

export const DEFAULT_LOCALE = "zh-CN" as const;

export const ALLOWED_HOSTS = new Set(["www.jd.com", "search.jd.com"]);

export const SENSITIVE_KEYWORDS = ["购物车", "购买", "立即购买", "提交订单", "去结算", "支付"];
