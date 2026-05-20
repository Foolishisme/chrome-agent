# Browser Agent Checkpoint

## 当前阶段

`phase-2-current-chain-consolidation`

## 当前主链

默认 session 路径：

`START_SESSION -> BrowserAgentRuntime -> src/background/runner -> RuntimeBrowserDriver -> content bridge`

默认非直答执行形态：

`taskSpec -> bounded round execution -> decideRoundAction -> finalize | replan | abort`

`direct_answer` 直接进入最终合成。

## 有效源码根

- `src/background/runtime/`
- `src/background/runner/`
- `src/background/tools/`
- `src/background/llm/`
- `src/background/browser/overview/explicit-url-overview.ts`
- `src/background/browser/capability/browser-driver-contract.ts`
- `src/content/bridge.ts`
- `src/content/content-script-host.ts`
- `src/content/scanner.ts`
- `src/content/content-action-executor.ts`
- `src/content/research.ts`
- `src/content/extractor.ts`
- `src/content/overlay.ts`
- `src/content/jd-search-selectors.ts`
- `src/shared/agent-domain-model.ts`
- `src/shared/llm-runtime-contract-schemas.ts`
- `src/shared/extension-message-protocol.ts`
- `src/shared/browser-capability-contract.ts`
- `src/shared/agent-runtime-config.ts`
- `src/shared/runtime-error.ts`

## 当前能力

- `BrowserAgentRuntime` 负责 session 生命周期、发布、停止、archive 和错误处理。
- 当前 runtime-visible tools：
  - `browser.search`
  - `browser.webDetail`
  - `browser.siteOverview`
  - `skill.commerceResearch`
- 轮末决策使用 `decideRoundAction`。
- 候选准备与最终合成使用：
  - `prepareTaskCandidates`
  - `finalizeTaskResult`
- conversation archive 保存用户可见结果。
- `SessionPublicState` 只广播 Side Panel 需要的会话、运行占位、错误和终态结果字段。
- runtime run log 通过 `src/background/runtime/run-log-store.ts` 按 `sessionId` 存储工具级诊断记录。
- 执行 timeline、当前 step/tool 和调试日志不进入前端状态或 conversation archive。

## 当前边界

- 当前只保留实际运行链；未接入主链的平行 driver、content bridge、低层 facade、QA route 和 future helper 已不属于当前事实源。
- `RuntimeBrowserDriver` 是默认浏览器驱动；测试中的 mock driver 位于 `tests/test-support/`。
- first-party tool contracts 仍是当前稳定 LLM-visible 能力边界。
- 思考链、中间推理过程、raw prompt 和 raw model intermediate text 不进入前端、archive 或 run log。
- 继续开发时，新增能力必须先证明 active call site、当前测试保护、安全/数据风险保护或事实源要求。

## 验证快照

最近记录通过的检查：

- `npx tsc --noEmit`
- `npm test -- tests/runtime.test.ts tests/runtime-bootstrap.test.ts tests/runtime-tools.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/sidepanel.test.ts tests/session-archive.test.ts tests/run-log-store.test.ts tests/result-filter.test.ts`
- `npm test`
- `npm run build`
- future-pattern `git grep` 静态检查

本 checkpoint 仅描述当前有效事实，不记录未来迁移计划。

更新日期：2026-05-20
