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
