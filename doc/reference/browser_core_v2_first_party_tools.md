# Browser Core V2 First-Party Tool Contracts

Updated: 2026-04-21

## 1. 定位

本文档记录 Browser Core V2 第一批 `LLM-visible tools` 的冻结契约。

本批只做：

- 工具边界
- input/output schema
- metadata
- prompt 示例
- 注册表与默认 handler 接线边界

本批不做：

- runtime 接线
- bounded plan runner 接线
- 前端 UI 改动
- 旧 workflow 删除

内部动作 `open / navigate / observe / read / extractLinksAndControls` 继续属于 Browser Core V2 内部能力层，不进入首批 `LLM-visible tool catalog`。

## 2. 首批工具

### `browser.search`

- 语义：打开并抽取浏览器看到的第一页自然结果。
- 适用：开放 research 入口、官方站点入口解析前置、资料查找。
- 不负责：翻页、候选重排、详情页阅读、最终总结。
- 输入：`query`, `scope?`
- 输出：`results[]`, `searchPageUrl`, `coverage`, `problems`
- 规则：只做第一页规则过滤并保持页面顺序；不暴露 `topK`。

### `browser.webDetail`

- 语义：读取单个高价值页面并返回脱水后的结构化详情。
- 适用：定价页、产品页、文档页、博客正文页。
- 不负责：同站多页概览。
- 输入：`url`, `goal?`
- 输出：`pageTitle`, `pageSummary`, `keyFacts[]`, `coverage`, `links?`, `problems`

### `browser.siteOverview`

- 语义：围绕明确站点入口读取主页与同站一跳页面，形成概览。
- 适用：官网产品、功能、定价、文档导航概览。
- 不负责：开放全网搜索。
- 输入：`entryUrl`, `goal`, `maxPages`, `maxDepth`
- 输出：`siteSummary`, `pagesRead[]`, `keyPages[]`, `gaps[]`, `coverage`, `problems`
- 规则：默认 `maxDepth=1`；主页与高价值一跳页面共存。

### `skill.commerceResearch`

- 语义：沿用旧 `commerce_search` 的黑盒 skill。
- 适用：购物调研、预算筛选、候选商品整理。
- 不负责：开放网页调研。
- 输入：`goal`, `budget?`, `constraints?`
- 输出：`shortlist[]`, `evidence[]`, `gaps[]`, `coverage`, `problems`

## 3. Metadata 口径

每个工具冻结以下字段：

- `name`
- `description`
- `inputSchema`
- `outputSchema`
- `sideEffectLevel`
- `parallelPolicy`
- `requires`
- `produces`
- `timeoutMs`
- `failurePolicy`

当前默认值：

- `browser.search / browser.webDetail / browser.siteOverview` -> `read_only`
- `skill.commerceResearch` -> `external_navigation`
- 首批工具都不允许高风险提交动作；高风险动作统一 `blocked`
- `parallelPolicy` 当前只冻结枚举和语义，不在本阶段接入执行层

## 4. Registry 接线

- 当前已新增 Browser Core V2 首批工具静态 registry 校验。
- registry 要求 key 与首批工具名完全一致，且每个 entry 都必须包含：
  - 完整 contract
  - 可执行 handler
  - 完整 metadata
- 当前默认 handler 口径：
  - `browser.search`：基于 BrowserDriver 打开搜索页并抽取第一页自然结果
  - `browser.webDetail`：基于 BrowserDriver 打开单页并返回脱水详情
  - `browser.siteOverview`：基于 BrowserDriver 串行读取入口页与同站一跳页面
  - `skill.commerceResearch`：通过 delegate/adapter 调用黑盒 commerce 流程；未接 delegate 时返回 `blocked`

当前仍未做：

- runtime 主循环接线
- bounded plan runner 调度
- 旧 workflow 到新 handler 的正式 adapter 合流

## 5. Prompt Catalog 使用口径

- `browser.search`
  - 该用：需要第一页候选结果时。
  - 不该用：需要单页详情或多页概览时。

- `browser.webDetail`
  - 该用：单页本身就有价值时。
  - 不该用：任务目标是理解整个站点时。

- `browser.siteOverview`
  - 该用：任务目标是站点概览时。
  - 不该用：任务目标是开放网页搜索时。

- `skill.commerceResearch`
  - 该用：商品候选整理与商调时。
  - 不该用：开放 research 或真实下单/支付时。
