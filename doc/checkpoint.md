# Browser Agent Checkpoint

## 当前阶段

`phase-2-single-root-unification`

## 当前主链

默认 session 路径：

`START_SESSION -> BrowserAgentRuntime -> src/background/runner`

默认非直答执行形态：

`taskSpec -> bounded round execution -> decideRoundAction -> finalize | replan | abort`

`direct_answer` 直接进入最终合成。

## 有效源码根

- `src/background/`
  - `runtime/`
  - `runner/`
  - `tools/`
  - `browser/`
  - `llm/`
- `src/content/core/`
- `src/shared/browser-core/`

## 当前能力

- `BrowserAgentRuntime` 负责 session 生命周期、发布、停止、archive 和错误处理。
- 主链 runtime-visible tools：
  - `browser.search`
  - `browser.webDetail`
  - `browser.siteOverview`
  - `skill.commerceResearch`
- 轮末决策使用 `decideRoundAction`。
- 候选准备与最终合成使用：
  - `prepareTaskCandidates`
  - `finalizeTaskResult`
- conversation archive 保存用户可见结果。
- runtime run log 通过 `src/background/runtime/run-log-store.ts` 按 `sessionId` 存储。
- `SessionPublicState.logs` 只作为当前 session live tail。

## 当前差距

- executor 仍按任务族定制；目标 runner 是通用 `RoundPlanSchema` runner。
- replan 仍 patch 当前 `taskSpec`；目标行为是每轮 bounded action planning。
- runtime 浏览器驱动走当前 runner adapter；目标 wiring 是基于 Chrome tabs 和 scripting 的 `StoreSafeDriver`。
- S1/S2/S3 浏览器验收需要真实 Chrome 证据。
- commerce research 还有 support bridge，需要收敛到稳定 tool 边界后方。
- `query-compiler.ts` 仍有规则式路由启发，需要更明确的 planner 边界。

## 下一步

先实现通用 `RoundPlanSchema` runner，再用该 runner 驱动 S1 explicit URL overview 走 `StoreSafeDriver` Chrome wiring。

完成信号：

- bounded actions 能通过 schema 和 ToolRegistry metadata 校验；
- runner 强制执行 action 数、依赖、失败策略和预算；
- S1 explicit URL overview 能走同一 runner 路径；
- acceptance 记录能区分 mock、build 和真实 Chrome 证据。

## 验证快照

最近记录通过的检查：

- `Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern '[/\\]browser-core-v2[/\\]'`
- `npm test -- tests/runtime.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/runtime-bootstrap.test.ts tests/session-archive.test.ts tests/sidepanel.test.ts tests/runtime-tools.test.ts tests/run-log-store.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/browser-core-v2/first-party-tool-contracts.test.ts tests/browser-core-v2/first-party-tool-registry.test.ts`
- `npm run build`
- `npx tsc --noEmit`

当前文档 checkpoint 更新验证独立于代码行为验证。

更新日期：2026-05-11
