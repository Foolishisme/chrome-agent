# site_overview 单站概况模式

## 任务摘要

新增 `site_overview` 单站模式：从可信站点入口开始，读取主页和主页一跳导航中的高价值页面，输出带来源与覆盖边界的单站概况。

## 变更原因

现有 `public_research` 面向 Google 多站来源。用户给出明确官网、URL，或询问某公司的官方产品/平台/文档/价格时，应优先读取目标官网，而不是默认走公网多站搜索。

## 范围与非目标

- 范围：`site_overview` task spec、入口解析、主页导航候选抽取、规则排序 + LLM 有界重排、替补次页读取、结果覆盖边界输出。
- 非目标：深层整站 crawl、下载型附件读取、字段级 `site_precise`、执行中动态改 plan。

## 影响区域

- 协议与 schema：`src/shared/types.ts`、`src/shared/schema.ts`、`src/shared/constants.ts`
- 路由与 LLM：`src/background/query-compiler.ts`、`src/background/prompting.ts`、`src/background/llm-client.ts`
- 工具与内容脚本：`src/background/tools/`、`src/content/actions.ts`、`src/content/research.ts`
- 验证：`tests/query-compiler.test.ts`、`tests/schema.test.ts`、`tests/site-overview.test.ts`
- 文档：`doc/spec.md`、`doc/constraints.md`、`doc/status.md`、`doc/acceptance.md`

## 计划变更

- 新增 `site_overview` task type 和 `resolveEntryPoint` runtime-visible tool。
- 新增 action-level `EXTRACT_SITE_NAV_LINKS`，只用于内容脚本抽取主页导航候选。
- `collectResearchCandidates` 支持站内分支：主页 + 规则过滤后的导航候选 + LLM 有界重排。
- `readResearchSourceFacts` 对单站模式启用替补策略：次页少于 200 字、404、登录墙、导航失败或不可读时记录问题并继续读后续候选。
- `finalizeResearchResult` 支持单站概况输出，并明确来源、读取范围和未覆盖区域。

## 验证计划

- 运行专项回归：`npx.cmd vitest run tests/query-compiler.test.ts tests/schema.test.ts tests/public-research.test.ts tests/research-search-quality.test.ts tests/site-overview.test.ts tests/llm-client.test.ts`
- 运行构建：`npm.cmd run build`
- 如有真实浏览器环境，再用官网 URL、`OpenAI 的产品`、`OpenAI 新闻/口碑` 三类样例手测路由边界。

## 风险与假设

- 本轮是 `site_overview`，不是字段级 `site_precise`。
- 默认成功目标是主页可读 + 至少 2 个可读次页；不足时输出 `partial`。
- `200` 字阈值复用 `LIMITS.PAGE_TEXT_MIN_LENGTH`。
- 不新增下载/附件 runtime-visible tool。
