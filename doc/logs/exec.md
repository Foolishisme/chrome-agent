# Execution Log

## 2026-04-17 - 文档系统重构

- Action: 将日常文档机制从 `threads / task plan / 默认 ADR` 收缩为 `status + logs`。
- Changed:
  - 更新 `AGENTS.md` 的默认装载顺序。
  - 重写 `doc/writing_rules.md`，明确默认装载层、按需查阅层和降级机制。
  - 新增 `doc/logs/exec.md`、`doc/logs/review.md`、`doc/logs/design.md`。
  - 将旧线程、任务级 plan 和三份新讨论稿移入 `doc/history/2026-04-17-doc-system-refactor/`。
  - 将 `doc/status.md` 收缩为当前态快照。
  - 改写全局 `plan-mode-doc-record` skill，使其写入 logs 而不是创建 `doc/plan/*.md`。
- Validation: 已检查 `doc/logs/` 存在、`doc/threads` 与 `doc/plan` 已移出主目录、默认入口不再指向旧机制，并检查 git diff。
- Result: 文档协议已切到低摩擦日志流；旧线程、任务级 plan 和三份讨论稿原文已归档到 `doc/history/2026-04-17-doc-system-refactor/`。
- Risk: 旧链接若直接指向 `doc/threads/active/*` 或 `doc/plan/*` 会失效；需要通过 history 回溯。
- Next: 后续任务只在需要时装载 `interaction / acceptance / pitfalls / history`。

## 2026-04-17 - 从旧工作线程迁入的执行记录

- Source: `doc/threads/active/work-plan-driven-runtime-migration.md`
- Summary: 旧 runtime/tool 契约收口已经完成，主链已切到 canonical plan loop；`direct_answer / commerce_search / public_research / site_overview` 已形成当前主链能力。
- Current Status: 代码事实已进入 `status.md`、`spec.md` 和 `acceptance.md`，原线程只保留历史回溯价值。

- Source: `doc/plan/2026-04-07-plan-mode-doc-record-skill.md`
- Summary: 曾新增全局 `plan-mode-doc-record` skill，让 Plan 模式创建 `doc/plan/YYYY-MM-DD-*.md` 任务记录。
- Current Status: 该机制本轮降级；skill 改为遵守项目文档协议，优先写入 `doc/logs/design.md` 或 `doc/logs/exec.md`。

## 2026-04-17 - 文档内容脱水与按需层迁移

- Action: 备份并脱水主文档，归档 active `plan.md`，把按需查阅层迁入 `doc/reference/`。
- Changed:
  - 已创建 `doc/history/2026-04-17-doc-content-dehydration/` 并备份本轮目标文档。
  - 已移除根目录 `doc/plan.md`。
  - 已将 `pitfalls.md / success_patterns.md / thread_bootstrap.md / adr/` 移入 `doc/reference/`。
  - 已脱水 `spec.md / acceptance.md / interaction.md`。
  - 已更新 `AGENTS.md / writing_rules.md / 文档审阅.md` 的入口和审阅规则。
- Validation: 已确认 `doc/plan.md` 不在根目录，`doc/reference/` 包含 `pitfalls.md / success_patterns.md / thread_bootstrap.md / adr/`；已检查主文档长度与旧路径引用。
- Result: 主文档已从“内容聚合”收缩为规则、边界和验收口径。
- Risk: `doc/other/` 和历史 ADR 中仍保留旧路径语境，按历史材料处理，不参与默认装载。

## 2026-04-17 - AGENTS 与文档审阅 SOP 小压缩

- Action: 压缩 `AGENTS.md` 和 `doc/review/文档/文档审阅.md` 的重复内容。
- Changed:
  - `AGENTS.md` 退回启动索引，只保留核心定义、当前模块、默认入口、硬提醒和判断题。
  - 文档审阅 SOP 不再重复维护完整文档分层，改为引用 `doc/writing_rules.md`，只保留检查流程和输出格式。
- Validation: 已检查文件长度和关键引用；`AGENTS.md` 为 73 行，SOP 仅引用 `doc/writing_rules.md` 作为规则源。
- Result: `doc/writing_rules.md` 保持文档系统规则唯一真理源。

## 2026-04-17 - 顶层设计原则补全

- Action: 将顶层设计目标、最小必要改动和未来事项处理规则落入文档系统。
- Changed:
  - `AGENTS.md` 增加最小必要改动和未来事项不得顺手实现的硬提醒。
  - `doc/spec.md` 增加四个顶层设计目标。
  - `doc/constraints.md` 增加最小必要改动和未来事项不得顺手实现的执行红线。
  - `doc/writing_rules.md` 增加未来事项处理规则，并登记 `doc/reference/design_principles.md`。
  - 新增 `doc/reference/design_principles.md`，作为按需查阅的完整设计原则。
- Validation: 待检查默认入口未新增该 reference 文档。
- Result: 顶层设计思想已进入可执行约束；完整说明仍留在按需层。

## 2026-04-20 - BrowserCapabilityLayer Phase 0 接口落地

- Action: 落地浏览器能力第 0 阶段接口、mock driver 和测试夹具。
- Changed:
  - 新增 `src/shared/browser-capability.ts`，定义 tab、target ref、risk level、page problem、observation、action result、screenshot 和 evaluate result 类型。
  - 新增 `src/background/browser-capability/`，包含 `BrowserDriver` contract、`BrowserCapabilityLayer` facade、`MockBrowserDriver` 和统一导出。
  - 新增 `tests/browser-capability.test.ts`，覆盖 mock contract、结构化 observe/action、driver error problem 化、navigation stale ref、高风险 blocked、evaluate 默认 blocked 和 screenshot failure problem 化。
  - 更新 `doc/logs/design.md`，记录 Phase 0 不新增 runtime-visible raw browser tool 的边界。
- Validation:
  - `npm test -- tests/browser-capability.test.ts tests/schema.test.ts` 通过，2 个测试文件，16 个测试。
  - `npm run build` 通过。
- Result: Phase 0 接口可供后续 `CdpDriver`、页面裁剪和 `site_overview explicit_url` adapter 依赖；现有 registry/runtime/workflow 未接入、未改变行为。
- Risk: 当前只有 mock driver，没有真实 Chrome/CDP 行为验证；attach/reattach、network idle、scripting fallback 和 screenshot sanitization 需在 Phase 1/2 实现时验证接口是否足够。

## 2026-04-20 - Browser Core V2 文件框架落地

- Action: 新建 `src/browser-core-v2` 隔离参考重写岛，并同步产品流程和文件框架文档。
- Changed:
  - 新增 `src/browser-core-v2/shared`，复用 Phase 0 `BrowserCapabilityLayer / BrowserDriver` 契约并提供 result/page problem helper。
  - 新增 `src/browser-core-v2/content`，包含 Readability/Turndown、DOM snapshot、stable refs、links/controls、page state/problems、low-risk interaction primitives 和 trimming。
  - 新增 `src/browser-core-v2/background`，包含 `StoreSafeDriver` 框架、content-script client 边界、browser tool schema/facade、explicit URL overview harness、action risk 和 result trimmer。
  - 新增 `tests/browser-core-v2/` 三个最小单测。
  - 新增 `turndown`、`@types/turndown` 和 `@types/jsdom` 依赖。
  - 新增 `doc/reference/browser_core_v2_file_framework.md`，并更新 `doc/plan.md`、`doc/status.md`、`doc/other/browser-agent-product-flow.md`。
- Validation:
  - `npm test -- tests/browser-capability.test.ts tests/browser-core-v2/readable-content.test.ts tests/browser-core-v2/dom-snapshot.test.ts tests/browser-core-v2/browser-tool-schema.test.ts` 通过，4 个测试文件，12 个测试。
  - `npm run build` 通过。
  - `npx tsc --noEmit` 未通过；剩余错误位于既有 `llm-client`、`read-research-source-facts` 和旧测试 fixture 类型，不是本次新增 Browser Core V2 目录引入。
- Result: Browser Core V2 现在有可编译、可测试的独立目录框架；现有 runtime-visible tool registry 未接入，旧 workflow 行为未改变。
- Risk: `StoreSafeDriver` 仍未接真实 `chrome.tabs / chrome.scripting`；低风险 interaction 只是 content primitive，尚未接 policy gate、确认 UI 或真机扩展验证。

## 2026-04-20 - Browser Core V2 验收口径切换

- Action: 将 active 验收目标从旧 workflow-first 任务模块切到 Browser Core V2 分层场景。
- Changed:
  - 将旧 `doc/acceptance.md` 原文归档到 `doc/history/2026-04-20-browser-core-v2-acceptance-shift/acceptance-workflow-first.md`。
  - 重写 `doc/acceptance.md`，定义 S0 直答回归、S1 explicit URL overview、S2 一跳读取、S3 开放问题浏览调研、S4 低风险页面操作、S5 advanced/CDP driver。
  - 更新 `doc/status.md`、`doc/plan.md`、`doc/spec.md`，同步第一主验收和旧 workflow 降级定位。
- Validation:
  - 文档结构检查通过。
  - 本次为文档口径更新，未运行代码测试。
- Result: `explicit_url overview via StoreSafeDriver` 成为当前第一主验收；旧 `direct_answer / commerce_search / public_research / site_overview` 只保留为回归、对照、fallback 或 harness。
- Risk: `StoreSafeDriver` 和 Agent Loop V2 minimal 尚未接线，S1 仍为 `NOT_RUN`。

## 2026-04-21 - 首批 LLM-visible tool contracts 冻结

- Action: 冻结 Browser Core V2 首批 `LLM-visible tools` 的静态契约、metadata、schema 示例与 prompt catalog，并同步最小 checkpoint 文档。
- Changed:
  - 新增 `src/browser-core-v2/background/tools/first-party-tool-contracts.ts`，定义 `browser.search`、`browser.webDetail`、`browser.siteOverview`、`skill.commerceResearch` 的 input/output schema、metadata、示例和 prompt guidance。
  - 新增 `src/browser-core-v2/background/tools/index.ts`，并更新 `src/browser-core-v2/background/index.ts` 导出首批工具契约。
  - 新增 `tests/browser-core-v2/first-party-tool-contracts.test.ts`，覆盖 schema 样例、metadata 完整性、prompt catalog 一致性、`browser.search` 不暴露 `topK`、`webDetail` 与 `siteOverview` 边界、`commerceResearch` 黑盒 skill 定位。
  - 新增 `doc/reference/browser_core_v2_first_party_tools.md`，记录首批工具边界、metadata 口径与 prompt 使用规则。
  - 更新 `doc/status.md` 与 `doc/logs/design.md`，同步“首批工具契约已冻结，但尚未接 runtime/tool registry”这一 checkpoint。
- Validation:
  - `npm test -- tests/browser-core-v2/browser-tool-schema.test.ts tests/browser-core-v2/first-party-tool-contracts.test.ts tests/public-research.test.ts tests/site-overview.test.ts` 通过，4 个测试文件，26 个测试。
  - `npm run build` 通过。
- Result: 第一批工具边界已经从旧 workflow 语义中抽出，并形成可供第二步 ToolRegistry / runner 接线的稳定契约；前端与 runtime 主循环未改动。
- Risk:
  - 当前只是“冻结契约”，还没有注册为真正可调度的 runtime-visible tool。
  - `skill.commerceResearch` 仍是契约级黑盒 skill，尚未做新范式接线。
  - 尚未运行全量测试，也未做真机扩展验证。
- Next: 先把首批工具契约接入 ToolRegistry，并补注册校验与最小 handler/mock 验证；在接线后再扩大测试范围，而不是先做全量“完整测试”。

## 2026-04-22 - 首批工具 registry 校验与 mock 验证

- Action: 为 Browser Core V2 首批工具补静态 registry、注册校验、默认 handlers、mock 验证和最小集成测试。
- Changed:
  - 新增 `src/browser-core-v2/background/tools/first-party-tool-registry.ts`，定义首批工具 registry、注册校验、统一执行入口与默认 handlers。
  - `browser.search / browser.webDetail / browser.siteOverview` 当前默认通过 BrowserDriver 只读路径执行。
  - `skill.commerceResearch` 当前通过 delegate/adapter 承接黑盒 commerce 流程；未接 delegate 时返回 `blocked`。
  - 更新 `doc/reference/browser_core_v2_first_party_tools.md`、`doc/status.md`、`doc/logs/design.md`，同步“静态 registry 已落地，但尚未接 runtime 主链”的 checkpoint。
  - 新增 `tests/browser-core-v2/first-party-tool-registry.test.ts`，覆盖 registry 完整性、注册失败校验、mock handler 验证，以及 search/webDetail/siteOverview/commerce delegate 的最小集成测试。
- Validation:
  - 待运行 Browser Core V2 registry 与相关回归测试。
  - 待运行 `npm run build`。
- Result: 首批工具从“只有静态契约”升级为“可注册、可校验、可 mock 执行”的静态 registry；下一步可以接 runtime-visible ToolRegistry 或 bounded plan runner。
- Risk:
  - 当前 search/webDetail/siteOverview handlers 仍是 Browser Core V2 只读路径的最小实现，不代表最终产品级恢复/裁剪厚度。
  - `skill.commerceResearch` 仍依赖 delegate/adapter，尚未直接接入旧 workflow 主链。
## 2026-04-22 - Browser Core V2 runtime loop cutover

- Action: Switched the runtime shell from the legacy `runRuntimeLoop()` path to `runBrowserCoreV2Loop()`, while keeping the existing `BrowserAgentRuntime` shell and side-panel public state protocol.
- Changed:
  - Added `src/browser-core-v2/background/runner/` with the Browser Core V2 runner, task plan builder, runtime BrowserDriver adapter, and task executors.
  - Updated `src/background/runtime/bootstrap.ts` to compile `taskSpec` during session start and build coarse display plans for the side panel.
  - Updated `src/background/runtime-core.ts` to call the Browser Core V2 loop instead of the legacy runtime loop.
  - Expanded `ToolName` to include first-party Browser Core V2 tools and kept legacy finalizers/helpers as internal adapters.
  - Wired `skill.commerceResearch` to a legacy commerce helper delegate so commerce sessions no longer default to `blocked`.
  - Added Browser Core V2 runtime loop tests and rewrote runtime orchestration coverage to validate the new loop entry.
- Validation:
  - `npm test -- tests/runtime.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/browser-core-v2/first-party-tool-contracts.test.ts tests/browser-core-v2/first-party-tool-registry.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/sidepanel.test.ts`
  - `npm run build`
  - `npx tsc --noEmit` still fails, but the remaining failures are in pre-existing `llm-client`, legacy research typing, and older test fixtures; the new runtime-loop cutover removed the new type errors introduced by this change.
- Result: The default runtime path now enters Browser Core V2 directly, uses first-party tools for public/site tasks, uses a wired commerce skill delegate, and keeps the side panel protocol stable.
- Risk:
  - The runtime BrowserDriver is still a temporary adapter over the existing tab/message bridge, not the final StoreSafeDriver chrome wiring.
  - Real-browser S1 validation is still not part of this change.
  - `npx tsc --noEmit` remains red for older repo issues outside the new runtime loop slice.
## 2026-04-22 - Non-direct tasks now decide finalize or replan

- Action: Inserted a shared round-end decision layer before final output for `public_research`, `site_overview`, and `commerce_search`.
- Changed:
  - Added `roundDecisionSchema`, `buildRoundDecisionPrompt()`, and `decideRoundAction()` to the shared LLM path.
  - Extended Browser Core V2 display plans with a `decideRoundAction` step before finalization for all non-direct tasks.
  - Updated task executors so non-direct tasks run a bounded round, call the decision layer, and either finalize, abort, or patch the current `taskSpec` for round 2.
  - Kept existing finalizers in place and reused them only after the decision layer returns `finalize`.
  - Added/updated tests for decision fallback, single-round finalize, and one-round replan to second-round finalize.
- Validation:
  - `npm test -- tests/llm-client.test.ts tests/runtime.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts`
  - `npm test -- tests/runtime.test.ts tests/llm-client.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/browser-core-v2/first-party-tool-contracts.test.ts tests/browser-core-v2/first-party-tool-registry.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/sidepanel.test.ts`
  - `npm run build`
  - `npx tsc --noEmit` still fails, but remaining errors are in pre-existing unrelated files/tests: `read-research-source-facts.ts`, `session-archive.test.ts`, and `sidepanel.test.ts`.
- Result: The main runtime path now supports a simple bounded two-round loop for non-direct tasks without adding per-tool special-case replanning code.
- Risk: Replan currently patches only the existing task type and still depends on coarse task executors; it is not yet a fully generic `RoundPlanSchema` runner.
## 2026-04-22 - Chain unification cleanup

- Action: Removed the inactive legacy runtime execution path, collapsed five legacy finalizer/filter pieces into two Browser Core V2 adapter modules, and rewired the active runner/tests around the new adapter surface.
- Changed:
  - Added `src/browser-core-v2/background/adapters/finalize-task-result.ts` and `src/browser-core-v2/background/adapters/prepare-task-candidates.ts`, plus adapter exports.
  - Updated Browser Core V2 task executors and display-plan wiring to use `prepareTaskCandidates` and `finalizeTaskResult` instead of legacy tool shells.
  - Removed inactive legacy execution pieces: `src/background/runtime/loop.ts`, `src/background/tools/registry.ts`, `src/background/tools/compile-task-spec.ts`, `src/background/tools/collect-commerce-candidates.ts`, `src/background/tools/finalize-*.ts`.
  - Removed the old chooser path from `llm-client.ts`, `prompting.ts`, and shared schema/type literals.
  - Reworked affected tests to validate the adapter path instead of the old runtime/tool-registry path.
- Validation:
  - `npm test -- tests/query-compiler.test.ts tests/runtime.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/llm-client.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/runtime-bootstrap.test.ts tests/sidepanel.test.ts tests/research-search-quality.test.ts tests/runtime-tools.test.ts`
  - `npm run build`
  - `npx tsc --noEmit`
- Result: The active chain now runs through Browser Core V2 adapters and no longer depends on the old runtime loop or legacy chooser path; build and typecheck are green again.
- Risk:
  - `skill.commerceResearch` still relies on a legacy helper through the current delegate path.
  - The runner is still task-family-specific and has not yet been lifted into a fully generic `RoundPlanSchema` runner.
## 2026-04-29 - Main doc dedupe

- Action: Rewrote the four main docs to remove repeated historical narration, reduce migration-story noise, and keep execution guidance centered on the current chain.
- Changed:
  - Rewrote `doc/spec.md` as current architecture truth only.
  - Rewrote `doc/constraints.md` as red lines only.
  - Rewrote `doc/plan.md` as active migration path and next steps only.
  - Rewrote `doc/status.md` as live checkpoint, gaps, risks, and validation only.
- Validation:
  - manual cross-check of `spec / constraints / plan / status`
  - `git diff -- doc/spec.md doc/constraints.md doc/plan.md doc/status.md doc/logs/design.md doc/logs/exec.md`
- Result: the main docs now say less about how the repo got here and more about what matters for the next execution step.
- Risk: this is a docs-only cleanup; it does not re-verify runtime behavior.
