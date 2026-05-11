import { describe, expect, it } from "vitest";
import {
  compileDirectAnswerTask,
  compilePublicResearchTask,
  compileSiteOverviewTask,
  compileSearchTask,
  compileTaskSpec,
  detectOutputMode,
  detectTaskType,
  detectTaskTypeWithLiteModel,
} from "../src/background/llm/query-compiler";

describe("query compiler", () => {
  it("builds the search query directly from the lite model", async () => {
    const task = await compileSearchTask("帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐", {
      refineWithLiteModel: async () => ({
        searchQuery: "轻薄本 5000元",
        reason: "保留预算并收敛到更适合站内搜索的商品词",
      }),
    });

    expect(task.taskType).toBe("commerce_search");
    expect(task.topK).toBe(5);
    expect(task.llmInputLimit).toBe(10);
    expect(task.extractLimit).toBeGreaterThanOrEqual(12);
    expect(task.searchQuery).toBe("轻薄本 5000元");
    expect(task.querySource).toBe("llm-lite");
    expect(task.outputMode).toBe("inline");
  });

  it("requires the lite model planner to produce the final on-site query", async () => {
    const task = await compileSearchTask("推荐一个适合学生办公的电脑", {
      refineWithLiteModel: async () => ({
        searchQuery: "学生办公 笔记本电脑",
        reason: "补全办公场景关键词",
      }),
    });

    expect(task.querySource).toBe("llm-lite");
    expect(task.searchQuery).toBe("学生办公 笔记本电脑");
  });

  it("routes non-shopping goals to public research with the rule fallback", () => {
    expect(detectTaskType("调研 Playwright 和 Selenium 的区别")).toBe("public_research");
    expect(detectTaskType("帮我找 5000 元耳机")).toBe("commerce_search");
  });

  it("routes stable knowledge questions to direct_answer", () => {
    expect(detectTaskType("解释一下事件循环是什么")).toBe("direct_answer");
  });

  it("routes time-sensitive questions to public_research", () => {
    expect(detectTaskType("今天金价是多少")).toBe("public_research");
  });

  it("routes explicit URLs and explicit official-site goals to site_overview", () => {
    expect(detectTaskType("帮我看一下 https://openai.com/ 的产品概况")).toBe("site_overview");
    expect(detectTaskType("OpenAI 官网的产品有哪些")).toBe("site_overview");
  });

  it("keeps company product questions on public_research unless site intent is explicit", () => {
    expect(detectTaskType("OpenAI 的产品有哪些")).toBe("public_research");
  });

  it("keeps reputation and news goals on public_research instead of site_overview", () => {
    expect(detectTaskType("OpenAI 最近新闻和市场观点")).toBe("public_research");
    expect(detectTaskType("OpenAI 口碑怎么样，第三方评价如何")).toBe("public_research");
  });

  it("builds a site overview task spec from an explicit URL", () => {
    const task = compileSiteOverviewTask("帮我看一下 https://openai.com/ 的产品概况");

    expect(task.taskType).toBe("site_overview");
    expect(task.entryMode).toBe("explicit_url");
    expect(task.entryUrl).toBe("https://openai.com/");
    expect(task.targetDomain).toBe("openai.com");
    expect(task.candidateLimit).toBe(6);
    expect(task.minReadableTextLength).toBe(200);
  });

  it("extracts site names from explicit official-site wording", () => {
    expect(compileSiteOverviewTask("OpenAI official website").siteName).toBe("OpenAI");
    expect(compileSiteOverviewTask("帮我看一下阿里云官网").siteName).toBe("阿里云");
  });

  it("keeps clear direct answers even when prefer_search is enabled", async () => {
    await expect(
      detectTaskTypeWithLiteModel("解释一下事件循环是什么", {
        searchPreference: "prefer_search",
      }),
    ).resolves.toMatchObject({
      taskType: "direct_answer",
      source: "rule",
    });
  });

  it("prefers public_research for ambiguous goals when prefer_search is enabled", async () => {
    await expect(
      detectTaskTypeWithLiteModel("帮我看看 Playwright 和 Cypress 怎么选", {
        searchPreference: "prefer_search",
      }),
    ).resolves.toMatchObject({
      taskType: "public_research",
      source: "rule",
    });
  });

  it("prefers lite-model routing when available", async () => {
    const routed = await detectTaskTypeWithLiteModel("3000 的手机推荐", {
      classifyWithLiteModel: async () => ({
        taskType: "commerce_search",
        reason: "contains product recommendation intent",
      }),
    });

    expect(routed).toEqual({
      taskType: "commerce_search",
      reason: "contains product recommendation intent",
      source: "llm-lite",
    });
  });

  it("falls back to rule-based routing when lite-model routing is unavailable", async () => {
    const routed = await detectTaskTypeWithLiteModel("调研 Playwright 和 Selenium 的区别");

    expect(routed.taskType).toBe("public_research");
    expect(routed.source).toBe("rule");
  });

  it("uses conversation turns when rule fallback handles a follow-up question", async () => {
    const routed = await detectTaskTypeWithLiteModel("那第二点再展开一下", {
      conversationTurns: [
        {
          turnId: 1,
          sessionId: "session-1",
          goal: "解释一下 Playwright 和 Selenium 的区别",
          answerSummary: "Playwright 在现代浏览器支持和自动等待上更强。",
          answerMarkdown: "summary",
          savedAt: Date.now(),
        },
      ],
    });

    expect(routed.taskType).toBe("direct_answer");
    expect(routed.source).toBe("rule");
  });

  it("falls back to rules when lite-model routing throws", async () => {
    const routed = await detectTaskTypeWithLiteModel("调研 Playwright 和 Selenium 的区别", {
      classifyWithLiteModel: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(routed.taskType).toBe("public_research");
    expect(routed.source).toBe("rule");
    expect(routed.reason).toContain("fallback");
  });

  it("falls back to a minimal research query when the lite model is unavailable", async () => {
    const task = await compilePublicResearchTask("帮我调研一下 Playwright 和 Selenium 的区别，进入前 3 个页面总结", {
      refineWithLiteModel: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(task.querySource).toBe("rule");
    expect(task.searchQuery).toContain("Playwright");
    expect(task.searchQuery).toContain("Selenium");
    expect(task.notes[0]).toContain("回退到规则");
  });

  it("only enables artifact output for explicit report/document requests", () => {
    expect(detectOutputMode("100元的电动牙刷推荐")).toBe("inline");
    expect(detectOutputMode("帮我生成一份电动牙刷选购报告")).toBe("artifact");
  });

  it("builds a direct-answer task spec from the recent conversation context", () => {
    const task = compileDirectAnswerTask("那第二点再展开一下", {
      routeReason: "recent conversation already contains enough evidence",
      currentTimeIso: "2026-04-08T08:00:00.000Z",
      timezone: "Asia/Shanghai",
      conversationTurns: [
        {
          turnId: 1,
          sessionId: "session-1",
          goal: "解释一下 Playwright 和 Selenium 的区别",
          answerSummary: "Playwright 在现代浏览器支持和自动等待上更强。",
          answerMarkdown: "summary",
          savedAt: Date.now(),
        },
      ],
    });

    expect(task.taskType).toBe("direct_answer");
    expect(task.routeReason).toContain("recent conversation");
    expect(task.evidenceTurnCount).toBe(1);
    expect(task.currentTimeIso).toBe("2026-04-08T08:00:00.000Z");
    expect(task.timezone).toBe("Asia/Shanghai");
  });

  it("builds a direct-answer task spec without a workflow plan", async () => {
    const compiled = await compileTaskSpec("解释一下事件循环是什么", {
      taskType: "direct_answer",
      currentTimeIso: "2026-04-08T08:00:00.000Z",
      timezone: "Asia/Shanghai",
    });

    expect(compiled.taskType).toBe("direct_answer");
    expect(compiled.taskSpec).toMatchObject({
      taskType: "direct_answer",
      currentTimeIso: "2026-04-08T08:00:00.000Z",
      timezone: "Asia/Shanghai",
    });
  });

  it("builds a site overview task spec with entry resolution", async () => {
    const compiled = await compileTaskSpec("OpenAI 的产品有哪些", {
      taskType: "site_overview",
    });

    expect(compiled.taskType).toBe("site_overview");
    expect(compiled.taskSpec).toMatchObject({
      taskType: "site_overview",
      entryMode: "resolve_official_home",
      siteName: "OpenAI",
      candidateLimit: 6,
      sourceTargetCount: 3,
    });
  });
});
