# Browser Agent Checkpoint

## 当前阶段

`phase-2-current-chain-consolidation`

## 当前主链

默认 session 路径：

`START_SESSION -> BrowserAgentRuntime -> src/background/runner -> RuntimeBrowserDriver -> content bridge`

默认非直答执行形态：

`taskSpec -> bounded round execution -> evidence bundle -> decideRoundAction -> finalize | replan | abort`

`direct_answer` 直接进入最终合成。

## 有效源码根

- `src/background/runtime/`
- `src/background/runner/`
- `src/background/tools/`
- `src/background/llm/`
- `src/background/browser/overview/explicit-url-overview.ts`
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
- public research 使用内部 `ResearchRuntimePolicy` 管理候选池、默认读取页数、并发、正文裁剪长度和最大轮次；这些默认值不属于 `PublicResearchTaskSpec`。
- public research 在 runner 内部完成搜索、过滤、重排和页面读取后，向后续阶段提供 `ResearchEvidenceBundle` 聚合证据包。
- 候选准备是 runner/tool 内部细节；最终合成使用 `finalizeTaskResult`，LLM prompt 只接收脱敏后的 task spec 和裁剪证据。
- conversation archive 保存用户可见结果。
- `SessionPublicState` 只广播 Side Panel 需要的会话、运行占位、错误和终态结果字段。
- runtime run log 通过 `src/background/runtime/run-log-store.ts` 按 `sessionId` 存储工具级诊断记录。
- 执行 timeline、当前 step/tool、过滤诊断、调试日志和 runtime policy 不进入前端状态、conversation archive 或常规 LLM prompt。

## 当前边界

- 当前只保留实际运行链；未接入主链的平行 driver、content bridge、低层 facade、QA route 和 future helper 已不属于当前事实源。
- `RuntimeBrowserDriver` 是默认浏览器驱动；`BrowserDriver` 合约位于 `src/shared/browser-capability-contract.ts`；测试中的 mock driver 位于 `tests/test-support/`。
- first-party tool contracts 仍是当前稳定 LLM-visible 能力边界。
- `TaskSpec` 表达任务语义；`ResearchRuntimePolicy` 表达执行策略；`ResearchEvidenceBundle` 表达 LLM 可见证据；`FinalResult` 表达用户可见终态结果。
- LLM round decision 只能调整 query/notes，不允许 patch 候选数、读取数、并发、裁剪长度、extract limit 或 retry 策略。
- 思考链、中间推理过程、raw prompt 和 raw model intermediate text 不进入前端、archive 或 run log。
- 继续开发时，新增能力必须先证明 active call site、当前测试保护、安全/数据风险保护或事实源要求。

## 验证快照

最近记录通过的检查：

- `npm run check:fast`
- `npm run check:repo` 部分通过；当前 macOS 环境缺少 `powershell`，`check:hygiene`、`check:legacy`、`check:docs`、`check:change-size` 无法执行。
- `npx tsc --noEmit`
- `npm test -- tests/query-compiler.test.ts tests/public-research.test.ts tests/runtime-tool-loop/runtime-tool-loop.test.ts tests/llm-runtime-contract-schemas.test.ts tests/session-archive.test.ts tests/llm-client.test.ts tests/research-search-quality.test.ts tests/run-log-store.test.ts tests/agent-runtime.test.ts`
- `npm test`：17 files / 133 tests
- `npm run build`
- future-pattern `git grep` 静态检查

本轮未完成的检查：

- `npm run check:docs`、`npm run check:legacy`、`npm run check:change-size` 依赖 PowerShell；当前 macOS shell 环境报 `powershell: command not found`。

本 checkpoint 仅描述当前有效事实，不记录未来迁移计划。

更新日期：2026-06-03
