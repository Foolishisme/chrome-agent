import { z } from "zod";

export const FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES = [
  "browser.search",
  "browser.webDetail",
  "browser.siteOverview",
  "skill.commerceResearch",
] as const;

export type FirstPartyLlmVisibleToolName = (typeof FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES)[number];

export const BrowserCoreV2SideEffectLevelSchema = z.enum(["read_only", "external_navigation"]);
export type BrowserCoreV2SideEffectLevel = z.infer<typeof BrowserCoreV2SideEffectLevelSchema>;

export const BrowserCoreV2ParallelPolicySchema = z.enum(["same_resource_serial", "singleton"]);
export type BrowserCoreV2ParallelPolicy = z.infer<typeof BrowserCoreV2ParallelPolicySchema>;

export const BrowserCoreV2FailurePolicySchema = z.object({
  defaultMode: z.enum(["return_partial", "fail_fast"]),
  highRiskAction: z.literal("blocked"),
});
export type BrowserCoreV2FailurePolicy = z.infer<typeof BrowserCoreV2FailurePolicySchema>;

export const BrowserCoreV2ToolProblemSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  suggestedNextAction: z.string().min(1).optional(),
}).strict();
export type BrowserCoreV2ToolProblem = z.infer<typeof BrowserCoreV2ToolProblemSchema>;

export const BrowserCoreV2CoverageSchema = z.object({
  scope: z.string().min(1),
  limitations: z.array(z.string().min(1)).default([]),
}).strict();
export type BrowserCoreV2Coverage = z.infer<typeof BrowserCoreV2CoverageSchema>;

export const BrowserSearchScopeSchema = z.enum(["web", "official_site"]);
export type BrowserSearchScope = z.infer<typeof BrowserSearchScopeSchema>;

export const BrowserSearchResultSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  rankOnPage: z.number().int().positive(),
}).strict();
export type BrowserSearchResult = z.infer<typeof BrowserSearchResultSchema>;

export const BrowserSearchToolInputSchema = z.object({
  query: z.string().min(1),
  scope: BrowserSearchScopeSchema.optional(),
}).strict();
export type BrowserSearchToolInput = z.infer<typeof BrowserSearchToolInputSchema>;

export const BrowserSearchToolOutputSchema = z.object({
  status: z.enum(["success", "partial", "failed", "blocked"]),
  results: z.array(BrowserSearchResultSchema),
  searchPageUrl: z.string().url(),
  coverage: BrowserCoreV2CoverageSchema,
  problems: z.array(BrowserCoreV2ToolProblemSchema),
}).strict();
export type BrowserSearchToolOutput = z.infer<typeof BrowserSearchToolOutputSchema>;

export const BrowserWebDetailLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
}).strict();
export type BrowserWebDetailLink = z.infer<typeof BrowserWebDetailLinkSchema>;

export const BrowserWebDetailFactSchema = z.object({
  text: z.string().min(1),
  evidenceUrl: z.string().url().optional(),
  evidenceTitle: z.string().min(1).optional(),
}).strict();
export type BrowserWebDetailFact = z.infer<typeof BrowserWebDetailFactSchema>;

export const BrowserWebDetailToolInputSchema = z.object({
  url: z.string().url(),
  goal: z.string().min(1).optional(),
}).strict();
export type BrowserWebDetailToolInput = z.infer<typeof BrowserWebDetailToolInputSchema>;

export const BrowserWebDetailToolOutputSchema = z.object({
  status: z.enum(["success", "partial", "failed", "blocked"]),
  pageTitle: z.string().min(1),
  pageSummary: z.string().min(1),
  keyFacts: z.array(BrowserWebDetailFactSchema),
  coverage: BrowserCoreV2CoverageSchema,
  links: z.array(BrowserWebDetailLinkSchema).optional(),
  problems: z.array(BrowserCoreV2ToolProblemSchema),
}).strict();
export type BrowserWebDetailToolOutput = z.infer<typeof BrowserWebDetailToolOutputSchema>;

export const BrowserSiteOverviewPageSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  role: z.enum(["entry", "docs", "pricing", "product", "about", "other"]),
  status: z.enum(["success", "partial", "failed"]),
}).strict();
export type BrowserSiteOverviewPage = z.infer<typeof BrowserSiteOverviewPageSchema>;

export const BrowserSiteOverviewToolInputSchema = z.object({
  entryUrl: z.string().url(),
  goal: z.string().min(1),
  maxPages: z.number().int().positive(),
  maxDepth: z.number().int().positive().default(1),
}).strict();
export type BrowserSiteOverviewToolInput = z.infer<typeof BrowserSiteOverviewToolInputSchema>;

export const BrowserSiteOverviewToolOutputSchema = z.object({
  status: z.enum(["success", "partial", "failed", "blocked"]),
  siteSummary: z.string().min(1),
  pagesRead: z.array(BrowserSiteOverviewPageSchema),
  keyPages: z.array(BrowserSiteOverviewPageSchema),
  gaps: z.array(z.string().min(1)),
  coverage: BrowserCoreV2CoverageSchema,
  problems: z.array(BrowserCoreV2ToolProblemSchema),
}).strict();
export type BrowserSiteOverviewToolOutput = z.infer<typeof BrowserSiteOverviewToolOutputSchema>;

export const CommerceResearchBudgetSchema = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
}).strict();
export type CommerceResearchBudget = z.infer<typeof CommerceResearchBudgetSchema>;

export const CommerceResearchShortlistItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  priceText: z.string().min(1).optional(),
  shopText: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
}).strict();
export type CommerceResearchShortlistItem = z.infer<typeof CommerceResearchShortlistItemSchema>;

export const CommerceResearchEvidenceSchema = z.object({
  text: z.string().min(1),
  evidenceUrl: z.string().url().optional(),
  evidenceTitle: z.string().min(1).optional(),
}).strict();
export type CommerceResearchEvidence = z.infer<typeof CommerceResearchEvidenceSchema>;

export const CommerceResearchToolInputSchema = z.object({
  goal: z.string().min(1),
  budget: CommerceResearchBudgetSchema.optional(),
  constraints: z.array(z.string().min(1)).optional(),
}).strict();
export type CommerceResearchToolInput = z.infer<typeof CommerceResearchToolInputSchema>;

export const CommerceResearchToolOutputSchema = z.object({
  status: z.enum(["success", "partial", "failed", "blocked"]),
  shortlist: z.array(CommerceResearchShortlistItemSchema),
  evidence: z.array(CommerceResearchEvidenceSchema),
  gaps: z.array(z.string().min(1)),
  coverage: BrowserCoreV2CoverageSchema,
  problems: z.array(BrowserCoreV2ToolProblemSchema),
}).strict();
export type CommerceResearchToolOutput = z.infer<typeof CommerceResearchToolOutputSchema>;

export interface FirstPartyToolPromptGuidance {
  whenToUse: string;
  whenNotToUse: string;
}

export interface FirstPartyToolExamples<TInput, TOutput> {
  minimalInput: TInput;
  successOutput: TOutput;
  partialOrBlockedOutput: TOutput;
}

export interface FirstPartyToolContract<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny> {
  name: FirstPartyLlmVisibleToolName;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  sideEffectLevel: BrowserCoreV2SideEffectLevel;
  parallelPolicy: BrowserCoreV2ParallelPolicy;
  requires: string[];
  produces: string[];
  timeoutMs: number;
  failurePolicy: BrowserCoreV2FailurePolicy;
  examples: FirstPartyToolExamples<z.input<TInputSchema>, z.output<TOutputSchema>>;
  promptGuidance: FirstPartyToolPromptGuidance;
}

const commonFailurePolicy: BrowserCoreV2FailurePolicy = {
  defaultMode: "return_partial",
  highRiskAction: "blocked",
};

const searchContract: FirstPartyToolContract<typeof BrowserSearchToolInputSchema, typeof BrowserSearchToolOutputSchema> = {
  name: "browser.search",
  description: "打开并抽取浏览器看到的第一页自然结果，只做规则过滤并保持页面顺序。",
  inputSchema: BrowserSearchToolInputSchema,
  outputSchema: BrowserSearchToolOutputSchema,
  sideEffectLevel: "read_only",
  parallelPolicy: "same_resource_serial",
  requires: ["browser.search_page", "browser.search_results_extract"],
  produces: ["search.results_page", "search.results_list"],
  timeoutMs: 20_000,
  failurePolicy: commonFailurePolicy,
  examples: {
    minimalInput: {
      query: "OpenAI official website",
      scope: "official_site",
    },
    successOutput: {
      status: "success",
      results: [
        {
          title: "OpenAI",
          url: "https://openai.com/",
          snippet: "Official site for OpenAI products, research, and platform docs.",
          source: "openai.com",
          rankOnPage: 1,
        },
        {
          title: "OpenAI API Platform",
          url: "https://platform.openai.com/",
          snippet: "Platform docs and API reference.",
          source: "platform.openai.com",
          rankOnPage: 2,
        },
      ],
      searchPageUrl: "https://www.google.com/search?q=OpenAI+official+website",
      coverage: {
        scope: "First visible natural results on the current search results page.",
        limitations: [],
      },
      problems: [],
    },
    partialOrBlockedOutput: {
      status: "partial",
      results: [],
      searchPageUrl: "https://www.google.com/search?q=OpenAI+official+website",
      coverage: {
        scope: "First visible natural results on the current search results page.",
        limitations: ["No usable natural results remained after rule-based filtering on the first page."],
      },
      problems: [
        {
          code: "NO_USABLE_RESULTS",
          message: "第一页自然结果过滤后没有保留可读候选。",
          suggestedNextAction: "换一个更具体的查询词，或手动打开一个候选页后再调用 browser.webDetail。",
        },
      ],
    },
  },
  promptGuidance: {
    whenToUse: "当任务需要先找第一页候选链接，而不是立即阅读某个详情页时使用 browser.search。",
    whenNotToUse: "不要用 browser.search 读取详情页正文，也不要把它当成跨页翻页或候选重排工具。",
  },
};

const webDetailContract: FirstPartyToolContract<typeof BrowserWebDetailToolInputSchema, typeof BrowserWebDetailToolOutputSchema> = {
  name: "browser.webDetail",
  description: "读取一个高价值页面，返回裁剪后的摘要、关键事实、覆盖边界和可继续追踪的链接。",
  inputSchema: BrowserWebDetailToolInputSchema,
  outputSchema: BrowserWebDetailToolOutputSchema,
  sideEffectLevel: "read_only",
  parallelPolicy: "same_resource_serial",
  requires: ["browser.open_or_navigate", "browser.page_read"],
  produces: ["research.page_detail", "research.page_links", "research.coverage_report"],
  timeoutMs: 25_000,
  failurePolicy: commonFailurePolicy,
  examples: {
    minimalInput: {
      url: "https://openai.com/pricing",
      goal: "看这个页面有没有公开定价信息",
    },
    successOutput: {
      status: "success",
      pageTitle: "Pricing",
      pageSummary: "该页面说明了 ChatGPT Team 与 Enterprise 的定价入口与联系路径，但未给出完整公开价格矩阵。",
      keyFacts: [
        {
          text: "页面包含 Team 和 Enterprise 的购买入口说明。",
          evidenceUrl: "https://openai.com/pricing",
          evidenceTitle: "Pricing",
        },
        {
          text: "页面没有覆盖所有产品的统一公开价格表。",
          evidenceUrl: "https://openai.com/pricing",
          evidenceTitle: "Pricing",
        },
      ],
      coverage: {
        scope: "Single explicitly requested page after trimming and readability extraction.",
        limitations: [],
      },
      links: [
        {
          title: "Contact sales",
          url: "https://openai.com/contact-sales",
        },
      ],
      problems: [],
    },
    partialOrBlockedOutput: {
      status: "partial",
      pageTitle: "Pricing",
      pageSummary: "页面可打开，但正文提取不足以形成完整结论。",
      keyFacts: [],
      coverage: {
        scope: "Single explicitly requested page after trimming and readability extraction.",
        limitations: ["Readable text was too short or partially blocked by page structure."],
      },
      links: [],
      problems: [
        {
          code: "READABILITY_PARTIAL",
          message: "正文脱水后信息不足，无法支持稳定摘要。",
          suggestedNextAction: "改用 browser.siteOverview 读取同站定价与产品页，或手动指定更高价值的单页。",
        },
      ],
    },
  },
  promptGuidance: {
    whenToUse: "当某个单页本身就值得读，例如定价页、产品页、文档页或博客正文页时使用 browser.webDetail。",
    whenNotToUse: "不要用 browser.webDetail 做同站多页概览；这类任务应优先使用 browser.siteOverview。",
  },
};

const siteOverviewContract: FirstPartyToolContract<typeof BrowserSiteOverviewToolInputSchema, typeof BrowserSiteOverviewToolOutputSchema> = {
  name: "browser.siteOverview",
  description: "围绕明确站点入口做主页与同站一跳概览，输出站点摘要、关键页面和未覆盖区域。",
  inputSchema: BrowserSiteOverviewToolInputSchema,
  outputSchema: BrowserSiteOverviewToolOutputSchema,
  sideEffectLevel: "read_only",
  parallelPolicy: "same_resource_serial",
  requires: ["browser.same_site_navigation_extract", "browser.page_read"],
  produces: ["research.site_overview", "research.coverage_report"],
  timeoutMs: 35_000,
  failurePolicy: commonFailurePolicy,
  examples: {
    minimalInput: {
      entryUrl: "https://openai.com/",
      goal: "总结这个站点的产品与定价入口",
      maxPages: 4,
    },
    successOutput: {
      status: "success",
      siteSummary: "站点主页提供产品导航，一跳可到产品、定价和文档入口，足以形成基础站点概览。",
      pagesRead: [
        { title: "OpenAI", url: "https://openai.com/", role: "entry", status: "success" },
        { title: "Products", url: "https://openai.com/products", role: "product", status: "success" },
        { title: "Pricing", url: "https://openai.com/pricing", role: "pricing", status: "partial" },
      ],
      keyPages: [
        { title: "Products", url: "https://openai.com/products", role: "product", status: "success" },
        { title: "Pricing", url: "https://openai.com/pricing", role: "pricing", status: "partial" },
      ],
      gaps: [],
      coverage: {
        scope: "Entry page plus same-site one-hop pages selected for the goal.",
        limitations: [],
      },
      problems: [],
    },
    partialOrBlockedOutput: {
      status: "partial",
      siteSummary: "入口页可读，但高价值同站页面不足，概览覆盖有限。",
      pagesRead: [{ title: "OpenAI", url: "https://openai.com/", role: "entry", status: "success" }],
      keyPages: [{ title: "OpenAI", url: "https://openai.com/", role: "entry", status: "success" }],
      gaps: ["No usable same-site navigation pages remained after filtering the homepage links."],
      coverage: {
        scope: "Entry page plus same-site one-hop pages selected for the goal.",
        limitations: ["Same-site navigation candidates were exhausted before enough high-value pages were collected."],
      },
      problems: [
        {
          code: "SITE_NAV_EXHAUSTED",
          message: "主页的一跳导航候选不足，无法形成完整站点概览。",
          suggestedNextAction: "如果你只关心某一页，请改用 browser.webDetail；否则换一个更明确的站点入口页。",
        },
      ],
    },
  },
  promptGuidance: {
    whenToUse: "当目标是理解一个站点整体，而不是只读一个单页时使用 browser.siteOverview。",
    whenNotToUse: "不要用 browser.siteOverview 做开放全网搜索；那类任务应先用 browser.search 找候选。",
  },
};

const commerceResearchContract: FirstPartyToolContract<typeof CommerceResearchToolInputSchema, typeof CommerceResearchToolOutputSchema> = {
  name: "skill.commerceResearch",
  description: "沿用旧 commerce_search 的黑盒逻辑，完成商品搜索、抽取、过滤、候选整理与结果汇总。",
  inputSchema: CommerceResearchToolInputSchema,
  outputSchema: CommerceResearchToolOutputSchema,
  sideEffectLevel: "external_navigation",
  parallelPolicy: "singleton",
  requires: ["legacy.commerce_search_workflow"],
  produces: ["commerce.shortlist", "commerce.evidence", "research.coverage_report"],
  timeoutMs: 45_000,
  failurePolicy: commonFailurePolicy,
  examples: {
    minimalInput: {
      goal: "找 3000 元以内适合学生写论文的轻薄本",
      budget: {
        max: 3000,
      },
      constraints: ["轻薄", "适合文档写作"],
    },
    successOutput: {
      status: "success",
      shortlist: [
        {
          title: "联想 轻薄本 示例机型",
          url: "https://item.jd.com/example-1.html",
          priceText: "¥2999",
          shopText: "联想京东自营旗舰店",
          summary: "满足预算，定位轻薄办公。",
        },
      ],
      evidence: [
        {
          text: "候选商品来自当前站内搜索结果并通过预算与标题规则过滤。",
          evidenceUrl: "https://search.jd.com/Search?keyword=%E8%BD%BB%E8%96%84%E6%9C%AC%203000%E5%85%83",
          evidenceTitle: "JD search results",
        },
      ],
      gaps: [],
      coverage: {
        scope: "Legacy commerce workflow over the current JD search and filtering path.",
        limitations: [],
      },
      problems: [],
    },
    partialOrBlockedOutput: {
      status: "blocked",
      shortlist: [],
      evidence: [],
      gaps: ["High-risk checkout, payment, or submission actions are out of scope for the first batch tool contract."],
      coverage: {
        scope: "Legacy commerce workflow over the current JD search and filtering path.",
        limitations: ["Only discovery, extraction, filtering, and recommendation are supported."],
      },
      problems: [
        {
          code: "HIGH_RISK_ACTION_BLOCKED",
          message: "首批 commerce skill 不允许执行下单、支付或不可撤回提交动作。",
          suggestedNextAction: "只返回候选与依据；若需要真实操作，应单独进入后续高风险动作阶段。",
        },
      ],
    },
  },
  promptGuidance: {
    whenToUse: "当目标是购物调研、商品候选整理或预算约束下的选购建议时使用 skill.commerceResearch。",
    whenNotToUse: "不要把 skill.commerceResearch 当成开放网页调研工具；开放 research 优先用 browser.search、browser.webDetail 或 browser.siteOverview。",
  },
};

export const FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS = {
  "browser.search": searchContract,
  "browser.webDetail": webDetailContract,
  "browser.siteOverview": siteOverviewContract,
  "skill.commerceResearch": commerceResearchContract,
} as const satisfies Record<FirstPartyLlmVisibleToolName, FirstPartyToolContract<z.ZodTypeAny, z.ZodTypeAny>>;

export function getFirstPartyToolContract(name: FirstPartyLlmVisibleToolName) {
  return FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS[name];
}

export function listFirstPartyToolContracts() {
  return FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES.map((name) => FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS[name]);
}

export function buildFirstPartyToolPromptCatalog() {
  return listFirstPartyToolContracts()
    .map((contract) =>
      [
        `Tool: ${contract.name}`,
        `Description: ${contract.description}`,
        `When to use: ${contract.promptGuidance.whenToUse}`,
        `When not to use: ${contract.promptGuidance.whenNotToUse}`,
      ].join("\n"),
    )
    .join("\n\n");
}
