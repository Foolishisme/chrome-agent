# 浏览器 Agent 状态

## 当前阶段

`browser-core-v2-controlled-rebuild`

## 当前快照

默认运行时路径现在是：
`启动会话 -> BrowserAgentRuntime -> Browser Core V2 runtime loop`

当前非直答执行形态是：
`taskSpec -> 一轮 bounded execution -> decideRoundAction -> finalize | replan | abort`

`direct_answer` 仍然直接结束，不经过轮次关口。

## 当前在线能力

- `BrowserAgentRuntime` 仍负责会话生命周期、发布、停止、存档和错误处理。
- 启动阶段先生成稳定 `taskSpec`，并为侧边栏构建粗粒度展示 plan。
- 主链不再使用 `allowedTools -> chooseToolForStep -> getToolDefinition()`。
- 首批 runtime-visible tools 已在主链：
  - `browser.search`
  - `browser.webDetail`
  - `browser.siteOverview`
  - `skill.commerceResearch`
- 当前非直答任务都经过统一轮末决策：
  - 汇总本轮候选、来源、条目和问题
  - 调用 `decideRoundAction`
  - 选择 `finalize`、`replan` 或 `abort`
- legacy 最终合成和候选准备已收口到 Browser Core V2 adapters：
  - `finalizeTaskResult`
  - `preparePublicResearchCandidates`
  - `prepareSiteOverviewCandidates`
  - `prepareCommerceCandidates`

## 当前任务路径

- **直接回答**
  - `finalizeTaskResult`

- **公开调研**
  - `browser.search`
  - `prepareTaskCandidates`
  - `browser.webDetail` batch
  - `decideRoundAction`
  - `finalizeTaskResult` 或进入第 2 轮

- **站点概览**
  - `browser.search` 仅在需要解析官网入口时调用
  - `browser.siteOverview`
  - `decideRoundAction`
  - `finalizeTaskResult` 或进入第 2 轮

- **电商搜索**
  - `skill.commerceResearch`
  - `decideRoundAction`
  - `finalizeTaskResult` 或进入第 2 轮

## 当前主要差距

- 当前 replan 仍然只是修补当前 `taskSpec`，不是通用 `RoundPlanSchema`。
- 当前执行器仍是 task-family-specific，不是通用单轮 plan runner。
- 当前 Browser Core V2 浏览器驱动仍是运行时适配层，不是最终 `StoreSafeDriver`。
- 真浏览器 S1/S2/S3 的事实闭环还不是当前 checkpoint。
- `skill.commerceResearch` 仍依赖一层 legacy helper。
- `query-compiler.ts` 仍有规则式路由启发，需要后续围绕 planner 边界继续收紧。

## 当前风险

- 多轮关口已建立，但执行器仍偏任务定制化。
- replan 只能在当前任务族内调整，还不能做更一般的策略转移。
- 适配层驱动的真浏览器稳定性可能与 mock / integration 测试不同。
- legacy helper 还没有完全收口到最终边界，后续清理需要继续只删死链，不误删活依赖。

## 下一步建议

1. 提升为通用 `RoundPlanSchema` runner。
2. 继续把 `open / observe / read / extract` 留在 Browser Core V2 内部。
3. 在真浏览器里验证 `public_research / site_overview / commerce_search` 的轮次关口。
4. 继续减少 `skill.commerceResearch` 的 legacy helper 依赖。

## 最新验证

- 通过：
  - `npm test -- tests/query-compiler.test.ts tests/runtime.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/llm-client.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/runtime-bootstrap.test.ts tests/sidepanel.test.ts tests/research-search-quality.test.ts tests/runtime-tools.test.ts`
  - `npm run build`
  - `npx tsc --noEmit`

Updated: 2026-04-29
