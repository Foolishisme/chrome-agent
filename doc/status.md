# 浏览器 Agent 状态

## 当前阶段

`phase-2-single-root-unification`

## 当前快照

默认运行时路径现在是：
`启动会话 -> BrowserAgentRuntime -> src/background/runner`

当前非直答执行形态是：
`taskSpec -> 一轮 bounded execution -> decideRoundAction -> finalize | replan | abort`

`direct_answer` 仍然直接结束，不经过轮次关口。

当前源码主轴已经统一为：

- `src/background/`
  - `runtime/`
  - `runner/`
  - `tools/`
  - `browser/`
  - `llm/`
- `src/content/core/`
- `src/shared/browser-core/`

`src/browser-core-v2/` 已从 source tree 中移除，不再保留第二套后台主目录系统。

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
- 候选准备和最终结果合成已收口到单一 adapter 层：
  - `prepareTaskCandidates`
  - `finalizeTaskResult`

## conversation archive 与 run log

- conversation archive 继续保存用户结果历史。
- 当前所有终态都会落 archive：`success / partial / failed / blocked`。
- `stop()` 当前按 `partial` 终态落档，避免丢失历史会话。
- 开发排查日志已从前端展示态分离为后台持久层：
  - `src/background/runtime/run-log-store.ts`
  - 基于 `chrome.storage.local`
  - 按 `sessionId` 读、导出和删除
- `SessionPublicState.logs` 只保留当前会话 live tail，不作为历史排查来源。

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
- 当前浏览器驱动仍是运行时适配层，不是最终 `StoreSafeDriver`。
- 真浏览器 S1/S2/S3 的事实闭环还不是当前 checkpoint。
- `skill.commerceResearch` 仍依赖一层 `legacy-support/open-search-results.ts`。
- `query-compiler.ts` 仍有规则式路由启发，需要后续围绕 planner 边界继续收紧。

## 当前风险

- 多轮关口已建立，但执行器仍偏任务定制化。
- replan 只能在当前任务族内调整，还不能做更一般的策略转移。
- 适配层驱动的真浏览器稳定性可能与 mock / integration 测试不同。
- commerce 路径虽然已退出 legacy tool shell，但内部仍保留一层 legacy support helper。

## 下一步建议

1. 提升为通用 `RoundPlanSchema` runner。
2. 继续把 `open / observe / read / extract` 留在工具或浏览器能力层内部。
3. 在真浏览器里验证 `public_research / site_overview / commerce_search` 的轮次关口。
4. 继续减少 `skill.commerceResearch` 的 legacy support helper 依赖。

## 最新验证

- 通过：
  - `Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern '[/\\]browser-core-v2[/\\]'`
    - source imports 已不再引用 `src/browser-core-v2/` 目录路径
  - `npm test -- tests/runtime.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/runtime-bootstrap.test.ts tests/session-archive.test.ts tests/sidepanel.test.ts tests/runtime-tools.test.ts tests/run-log-store.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/browser-core-v2/first-party-tool-contracts.test.ts tests/browser-core-v2/first-party-tool-registry.test.ts`
  - `npm run build`
  - `npx tsc --noEmit`

Updated: 2026-04-29
