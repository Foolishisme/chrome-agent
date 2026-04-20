# Browser Core V2 Controlled Rebuild Plan

## 1. 定位

本文档是当前 active migration plan。

当前核心任务：

`在现有仓库内受控重建 Browser Core V2，优先用 store-safe JS/DOM 能力和 bounded plan + thin runner 完成范式迁移最小闭环，再把 CDP/debugger 降级为高级/企业/本地 driver。`

本计划不是删除重开。旧 workflow/code 可以保留为历史、对照、fallback 或 harness；只要不进入新主链、不参与不必要编译、不拖累验证，就不优先删除。

本计划完成并进入稳定实现后，应归档到 `doc/history/`，不长期保留 active `doc/plan.md`。

## 2. 仓库路径

当前产品仓库：

- `D:\code\browser-agent-mvp`

ChromeClaw 参考仓库：

- `D:\test\chromeclaw`

执行规则：

- Browser Core V2 的代码、测试和文档默认写入 `D:\code\browser-agent-mvp`。
- ChromeClaw 只用于静态阅读、行为抽取和测试样本参考。
- 不直接 fork ChromeClaw，不把实现改动写入 `D:\test\chromeclaw`，除非用户明确要求。

## 3. 总原则

- 新主线是 `Browser Core V2`，不是继续修旧 workflow。
- 新主线的执行形态是有限任务节点 + 每轮 bounded action plan + thin runner，而不是单工具 ReAct、全局长 plan 或重型 DAG runtime。
- 当前 MVP 继续提供结构化契约、UI/provider 基础和验证 harness。
- 默认大众/商店路径优先 `StoreSafeDriver`，不默认依赖 `debugger` / CDP。
- `CdpDriver` 保留为 advanced/local/enterprise driver，后置实现。
- ChromeClaw 提供 browser tool 行为参考和测试样本，不继承其默认权限形态。
- 旧 `direct_answer / commerce_search / public_research / site_overview` 降级为 harness/fallback/历史参考。
- 当前验收口径不再以旧任务模块为主；active 验收源是 `doc/acceptance.md` 中的 Browser Core V2 S0-S5 分层场景。
- 旧代码不因“旧”而删除；只有阻塞编译、测试、安全、理解或产品主链时才清理。
- Memory、subagent、cron、channel、Google identity 等非 browser core 能力后置。
- 第一阶段不引入 LangGraph、Temporal 或类似重型编排框架；先实现 TS 版轻量 runner。

## 4. 已保留资产

从当前 MVP 保留并抽取：

- `ToolResult / ActionResult / FinalResult`
- `success / partial / failed / blocked`
- `SemanticSnapshot`
- `SourceFactCard`
- provider / side panel / runtime 基础设施
- content-script JS/DOM extraction
- `scanner.ts / actions.ts / research.ts / extractor.ts` 中的 observe/read/extract/click/type/scroll 雏形
- `@mozilla/readability` 已在 `src/content/research.ts` 接入正文提取，当前输出 `extractionStrategy: "readability" | "fallback"`
- `site_overview explicit_url` 作为第一验证 harness

从 ChromeClaw 借鉴：

- LLM-facing `browser(action)` facade 形态
- snapshot/refMap 思路
- navigate fallback
- click/type fallback
- result truncation/sanitization
- tool 级单测组织方式
- CDP driver 作为高级能力参考

## 4.1 Browser Core V2 文件框架

新主线采用隔离的参考重写岛，而不是把文件散落进旧主目录：

`src/browser-core-v2/`

目录边界：

- `shared/`：跨 background/content 的类型、contract re-export、result helper 和 page problem helper。
- `content/`：store-safe JS/DOM primitives，包括 DOM snapshot、stable refs、links/controls、Readability、Turndown、page state、page problems、低风险 interaction 原语和裁剪。
- `background/`：StoreSafeDriver 框架、content-script client 边界、LLM-facing browser tool schema/facade、explicit URL overview harness、action risk 和 result trimming。
- `background/runner/`：后续 bounded plan schema、thin runner、action 调度、输出引用解析和统一错误聚合。
- `background/tools/`：后续 Browser Core V2 ToolRegistry，注册原子语义工具及其 metadata。
- `downloads/`：只预留未来 `chrome.downloads` API 归属，不在当前阶段请求权限或实现下载。
- `test-support/`：后续 Browser Core V2 测试夹具。

当前文件框架记录在 `doc/reference/browser_core_v2_file_framework.md`。

原则：

- 不新建 `SRE` 目录，避免与 Site Reliability Engineering 语义冲突。
- 不在本阶段注册 runtime-visible browser tool。
- 不引入 browser-use 依赖；只参考其 DOM serializer / markdown extractor 思路。
- `turndown` 是当前补充的唯一运行时依赖，用于把 Readability HTML 转成 markdown excerpt。
- CDP/debugger 保持后置 advanced/local/enterprise driver。

## 5. 阶段拆分

### Phase 0 - Core Contract and Mock Harness

状态：已落地接口和 mock 测试夹具。

目标：

- 定义 `BrowserCapabilityLayer` / `BrowserDriver` contract。
- 定义 tab、target ref、risk level、page problem、observation、action result、screenshot 等共享类型。
- 建立 mock driver 和最小测试夹具。

验收：

- 不改变现有 runtime/workflow 行为。
- 后续 `StoreSafeDriver`、页面裁剪和 adapter 可依赖该 contract。
- raw debugger/evaluate 不暴露为 runtime-visible LLM 工具。

### Phase 1 - Browser Core V2 File Framework and Store-safe Facade

状态：文件框架已建立；下一步是 StoreSafeDriver wiring。

目标：

- 在 `src/browser-core-v2` 建立隔离参考重写岛，不污染旧 runtime/tools/workflow 主链。
- 从现有 content-script JS/DOM 能力抽取 `StoreSafeDriver`。
- 建立 LLM-facing browser tool facade 的最小 action 集：`open/navigate/observe/read/extractLinksAndControls/finalize`。
- 保留现有 `@mozilla/readability` 路径，补充 `turndown` 生成 markdown excerpt；不要重写已可用的 Readability fallback 链路。
- 先支持 explicit URL 的只读浏览，不默认 `debugger`、不默认 `<all_urls>`。
- 使用 `activeTab / scripting / optional host access / content script` 路线。

验收：

- `browser-core-v2` 能在 store-safe 权限下完成 explicit URL 打开、观察、读取和结构化返回。
- 页面内容进入 LLM 前经过 Readability/Turndown、裁剪、脱水或结构化。
- 旧 workflow 未被强制接入。
- 不需要 CDP 也能跑通第一闭环。

### Phase 2 - Bounded Plan Runner and Agent Loop V2 Minimal

目标：

- 新建最小 bounded plan runner，不再依赖旧静态 workflow。
- LLM 每轮为当前子目标生成 1-5 个 action 的局部 plan；runner 负责 schema 校验、工具白名单、串并行调度、输出引用解析、失败归一和 state 更新。
- 建立带 metadata 的 ToolRegistry，工具至少声明 name、schema、sideEffectLevel、parallelPolicy、requires、produces、timeout、failure policy 和 handler。
- LLM 基于 runner 更新后的 state 决定继续读页、读一跳链接、停止或汇总。
- Runtime 只做预算、停止、loop guard、状态广播和 final result 兜底。
- 第一任务为 `explicit_url overview via bounded plan runner + StoreSafeDriver`。

验收：

- 不走 `compileTaskSpec -> PlanStep -> allowedTools -> finalize*` 旧链路，也能用一轮 bounded plan 完成 explicit URL overview。
- runner 能拒绝超长 plan、未知工具、schema 失败、越权高风险 action 和不满足前置条件的 action。
- runner 能串行执行 `browser.open -> browser.observe/read`，并能在 mock 中验证不同资源的只读 action 可受限并行。
- 输出已读页面、跳过页面、覆盖边界和未覆盖区域。
- 结果能表达 `success / partial / failed / blocked`。

### Phase 3 - Tool Hardening

目标：

- 强化 store-safe 工具厚度：恢复、重试、stale target、页面问题识别、result trimming。
- 增加一跳页面读取、受限并发和 partial success。
- 建立更多 mock 和 unit tests。

验收：

- 工具内部能处理常见失败，不把恢复步骤暴露给 LLM。
- 页面失败不拖垮整个任务。
- LLM 主要做少量选择和汇总，而不是逐 DOM 步骤编排。

### Phase 4 - Low-risk Interaction

目标：

- 实现 click、type、press、scroll 的低风险子集。
- 动作前后重新 observe。
- 引入 action risk gate。

验收：

- 支持搜索框输入、展开菜单、打开链接、滚动和普通草稿填写。
- 下单、支付、删除、发送不可撤回内容等高风险动作默认 blocked 或要求确认。

### Phase 5 - Advanced Drivers

目标：

- 实现 `CdpDriver` 作为 advanced/local/enterprise driver。
- 借鉴 ChromeClaw 的 CDP attach/reattach、DOM snapshot、screenshot、Input fallback。
- 不作为大众商店版默认能力。

验收：

- Store-safe 主链不依赖 `debugger`。
- CdpDriver 可作为对照、企业版或本地高级模式。
- 权限、隐私说明、stop/takeover、高风险确认完整。

## 6. 推荐开发方式

串行：

1. 每个阶段先冻结 contract 和测试清单。
2. 主线程负责冻结 bounded plan schema、ToolRegistry metadata、ToolResult 边界和最终集成。
3. Bounded plan runner 与 Agent Loop V2 最小闭环由主线程串行收口。

并发：

- Worker A: `StoreSafeDriver` observe/read/extract。
- Worker B: page trimming、page problem detection、result shaping。
- Worker C: ToolRegistry metadata、bounded plan schema 和 runner mock 单测。
- Worker D: explicit URL overview harness/adapter。
- Worker E: mock driver、content-script driver 单测和 browser facade 单测。

后置并发：

- Worker F: low-risk click/type/scroll。
- Worker G: advanced `CdpDriver`。

收口：

- 不让多个 worker 同时改 runtime 主循环。
- 不让多个 worker 同时改共享 result contract。
- 新主链验证通过前，不删除旧 workflow。
- 不在 runner 稳定前引入重型 DAG 框架或长期 checkpoint/resume 机制。

## 7. 第一闭环

默认第一闭环：

`explicit_url overview via bounded plan runner + StoreSafeDriver`

它对应 `doc/acceptance.md` 的 S1，是当前 Browser Core V2 的第一主验收。S0 直答只作为回归基线，用来确保明确可直接回答的问题不会误触 browser tool。

成功标准：

- 输入明确 URL。
- LLM 或测试夹具生成一轮 1-5 个 action 的 bounded plan。
- runner 校验 ToolRegistry metadata、工具白名单、前置条件、输出引用和预算。
- Browser Core V2 用 store-safe driver 打开/导航/观察页面。
- 页面被裁剪成短结构化观察。
- LLM 基于 observation 决定是否读取一跳链接或汇总。
- 最终输出结构化结果和覆盖边界。
- 旧链路可作为对照，但不是新主链。
- 不要求 `debugger` / CDP。

后续验收顺序：

1. S1：明确 URL 页面理解。
2. S2：明确 URL + 一跳高价值链接读取。
3. S3：开放问题浏览调研。
4. S4：低风险页面操作。
5. S5：advanced / CDP driver。

## 8. 不做事项

当前阶段不优先做：

- 删除旧 workflow。
- 重写整个 runtime。
- 引入重型 DAG / LangGraph / Temporal 式编排框架。
- 让 LLM 生成无限长 plan、任意 selector、任意 JS 或未注册工具 action。
- 默认依赖 `debugger` / CDP。
- 默认 `<all_urls>`。
- memory 长期化。
- subagent 产品化。
- cron / channel。
- TTS / media understanding。
- Google identity / Gmail / Drive。
- cookies / declarativeNetRequest 默认权限。
- 高风险真实账户自动化。

## 9. Revisit Trigger

需要重新评估本计划的情况：

- StoreSafeDriver 无法支撑 explicit URL overview 的最低可用质量。
- Agent Loop V2 最小闭环在没有 CDP 时无法稳定完成。
- 页面裁剪和结构化仍无法明显减少 LLM 上下文噪音。
- 新主链被旧 workflow 依赖拖住，无法独立验证。
- 并发开发导致 contract 反复变更，集成成本高于收益。

Updated: 2026-04-20
