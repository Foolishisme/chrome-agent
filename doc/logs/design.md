# Design Log

## 2026-04-17 - 文档系统收缩

- Question: 当前文档系统是否继续沿 `threads / plan / ADR` 的任务级文件机制扩张。
- Options:
  - A: 保留 `threads/active`、任务级 `doc/plan/*.md` 和 ADR 作为常规沉淀机制。
  - B: 保留 `interaction / acceptance` 的职责分离，把线程、任务计划和普通决策过程收缩到按职责分开的 append-only logs。
- Decision: 采用 B。
- Reason: 当前主要摩擦不是缺少文档，而是默认装载过重、状态与过程混写、任务级文件数量膨胀。`interaction.md` 和 `acceptance.md` 仍有清晰职责，继续保留；`threads / doc/plan / ADR` 降级为历史或罕见例外。
- Revisit Trigger: 长期超过 4 条活跃任务线、多人成员共同维护、需要强审计链路，或设计决策反复被挑战且日志不足以说明背景。

## 2026-04-17 - 从旧线程迁入的设计结论

- Source: `doc/threads/active/design-doc-protocol-structure.md`
- Decision: 文档系统需要清晰分层，避免设计、路径、状态、线程和历史混写。
- Updated Decision: 原先推荐 `threads/active` 与 `adr/` 作为日常机制；本次收缩后，线程实例归档，设计取舍统一进入 `doc/logs/design.md`，ADR 只作为罕见例外。

- Source: `doc/threads/active/design-llm-first-plan-driven.md`
- Decision: 当前执行范式采用 `LLM plan-driven tool orchestration`，`LLM` 负责静态初始 plan、tool 选择、step 状态更新和最终汇总，`Tools` 封装稳定能力与局部恢复，`Runtime` 只做最小保障层。
- Current Status: 该结论已进入 `spec.md / constraints.md / status.md`，原线程只保留历史回溯价值。

- Source: `doc/threads/active/design-direct-answer-routing.md`
- Decision: `direct_answer` 成为正式 task module；是否搜索由规划阶段结合当前绝对时间、用户目标、近期证据和 `searchPreference` 判断。
- Current Status: 该结论已落地到代码和 `spec / constraints / acceptance`，原线程只保留历史回溯价值。

- Source: `doc/plan/2026-04-13-site-overview-mode.md`
- Decision: `site_overview` MVP 只覆盖可信入口、主页、一跳高价值页面、覆盖边界输出；不做深层递归、下载型附件或精准字段确认。
- Current Status: 该结论已落地到 `site_overview` 代码路径和验收补充，原任务级 plan 只保留历史回溯价值。

## 2026-04-17 - 新讨论稿处理

- Source: `doc/顶层设计草案.md`
- Decision: 提炼为文档系统与代码组织的顶层原则，不作为新的主入口文档。
- Extracted Principle: 让 AI 找得到、判得清、改得动、跑得通；让人类在关键处看得懂、接得住。

- Source: `doc/文件文档改版设计.md`
- Decision: 采纳“少量高权重文件 + 极小状态快照 + append-only logs”的方向，但保留 `interaction.md / acceptance.md` 的职责分离。

- Source: `doc/走过的弯路与收获_1_页.md`
- Decision: 作为复盘原文归档；核心经验进入 `pitfalls.md` 的按需查阅层。

## 2026-04-17 - 主文档脱水与按需层迁移

- Question: 主文档是否继续保留过去式、接口细节和按需材料在 `doc/` 根目录。
- Decision: 主文档只保留当前成立的规则、边界和不变量；过去式进入 logs/history；代码可查的接口细节不手抄；按需查阅层迁入 `doc/reference/`。
- Reason: 当前主要摩擦来自主文档内容过长、职责混写和默认入口噪音。`spec / acceptance / interaction` 需要继续保留，但必须脱水。
- Revisit Trigger: 如果项目进入多人协作、强审计或长期 active migration 阶段，再评估是否恢复 active `plan.md` 或更强决策记录机制。

## 2026-04-17 - 顶层设计原则落位

- Question: 顶层设计草案和原 AGENTS 中的设计思想是否应进入默认装载。
- Decision: 不新增默认必读长文档；将四个顶层设计目标写入 `spec.md`，将最小必要改动和未来事项不得顺手实现写入 `AGENTS.md / constraints.md`，完整原则放入 `doc/reference/design_principles.md` 按需查阅。
- Reason: 顶层原则应可执行，但不能重新加重默认装载层。
- Revisit Trigger: 如果多次出现架构取舍误判、过度抽象或未来能力被顺手实现，再评估是否把更多原则提升到默认入口。
## 2026-04-17 - ChromeClaw 深度调研决策记录

- Question: ChromeClaw 是否应成为当前浏览器通用 Agent 的主代码基底，或仅作为能力层与工程实现参考。
- Scope: 静态阅读 `D:\test\chromeclaw` 的文档、manifest、agent loop、tools、browser/CDP、offscreen、storage、UI 配置入口，并与当前 MVP 的 runtime、tool、snapshot、final result 合约对比；不运行真实扩展、不配置 provider、不做浏览器任务 spike。
- Decision: 暂定 `partially adopt`。当前 MVP 继续作为主代码基底，只选择性重写借鉴 ChromeClaw 的 CDP browser capability、tool registration、provider/options/offscreen 经验。
- Report: `doc/other/chromeclaw-deep-dive-decision.md`。
- Revisit Trigger: `site_overview explicit_url` 的 CdpDriver spike 在真实公共站点上显著优于当前 content-script driver，且 `debugger` 权限提示可被产品接受。
- Update: 用户明确指出 `debugger` 权限对大众用户不是主要阻力，通用浏览器 agent 本来就是目标；workflow 是因为尚未掌握通用流程而采用的验证脚手架。报告已修正为更积极采用 ChromeClaw browser capability，并把主要风险从权限接受度调整为安全 envelope、用户可见控制和无关高敏权限裁剪。

## 2026-04-17 - 通用浏览器 Agent 范式切换

- Question: 第一阶段应继续围绕 workflow 增量优化，还是正式把产品目标切换为通用浏览器 Agent，并把 workflow 降级为验证脚手架。
- Decision: 切换为通用浏览器 Agent 范式。当前 MVP 代码保留为主基底；workflow/module 不再是长期产品边界，只作为验证场、训练轮和可沉淀 skill/tool 的脚手架。
- Reason: ChromeClaw 调研和用户反馈共同确认，真实差距主要在 browser tools、工具内部恢复重试、页面裁剪、批量观察和流式输出，而不是先补 memory 或继续加重 workflow。通用流程本质仍是 LLM 少量高价值决策加大量工具执行结果回填。
- Default Path: 先定义 `BrowserCapabilityLayer`，再做 `CdpDriver` spike，以 `site_overview explicit_url` 验证 snapshot、screenshot、导航恢复、页面裁剪和最终汇总质量。
- History: 切换前核心文档已快照到 `doc/history/2026-04-17-general-browser-agent-shift/`。
- Revisit Trigger: 如果 CDP spike 不能显著改善页面观察/恢复/速度，或权限说明、stop/takeover、高风险确认无法形成可接受产品体验，则重新评估是否继续以 content-script workflow harness 为主。

## 2026-04-20 - Browser tools 迁移阶段定位

- Question: 下一阶段应优先完整迁移 runtime 范式，还是先参考 ChromeClaw 分阶段迁移浏览器工具集。
- Decision: 将“分阶段迁移/重写 browser tools，构建 `BrowserCapabilityLayer`”定为下一阶段核心任务；runtime 范式迁移后置到 tools 足够厚之后。
- Plan: 恢复 active `doc/plan.md`，按 Phase 0-5 推进：接口定界、只读观察、导航生命周期、低风险动作、工具内恢复/批量读取/裁剪、低风险通用 browser mode。
- Execution Shape: 先串行冻结接口和核心类型，再并发开发互不重叠的能力块，最后串行集成 `site_overview explicit_url`。
- Reason: ChromeClaw 的速度和稳定性主要来自厚 browser tools、恢复重试、裁剪、批量执行和流式结果，而不是先拥有复杂 runtime；当前 workflow 仍可作为验证 harness。
- Revisit Trigger: 如果 Phase 1 的 CDP 只读观察不能改善 `site_overview explicit_url` 的稳定性、速度或结果质量，则暂停后续阶段并重新评估 driver 路线。

## 2026-04-20 - BrowserCapabilityLayer Phase 0 接口边界

- Question: Phase 0 是否应照搬 ChromeClaw 的 LLM-facing `browser` 大工具，还是先冻结内部 browser capability contract。
- Decision: 先新增 `BrowserCapabilityLayer`、driver contract、结构化观察/动作类型和 mock driver；不接入 runtime，不新增 runtime-visible raw browser tool。
- Reference: 本地 `D:\test\chromeclaw\chrome-extension\src\background\tools\browser.ts / cdp.ts / debugger.ts` 的 tabs、snapshot、refMap、CDP reattach、screenshot 和 fallback 设计。
- Boundary: ChromeClaw 的 raw debugger send/attach/detach/list_targets 和任意 evaluate 只作为内部参考；本阶段 `evaluateLimited` 默认 experimental/internal，不暴露给 LLM。
- Revisit Trigger: Phase 1 接入真实 `CdpDriver` 时，如果接口无法表达 attach failure cache、stale ref、network idle 或 screenshot sanitization，再调整 contract。

## 2026-04-20 - Browser Core V2 受控重建

- Question: 当前 MVP 设计重心偏向 workflow，是否继续修旧链路，还是直接删除重开。
- Decision: 采用受控重建。新主线为 `Browser Core V2`，在现有仓库内抽取 ChromeClaw browser tool 行为和当前 MVP 结构化契约重写；旧 workflow/code 保留为历史、对照、fallback 或 harness，不继续作为新主链投资。
- Reason: 完全删除重开会丢掉 provider/UI/result contract/SourceFactCard/site_overview 验证资产；继续修旧 workflow 会让错误重心延续。受控重建能保留资产，同时让新链路独立验证。
- Plan Update: `doc/plan.md` 从 browser tool migration 改为 `Browser Core V2 Controlled Rebuild Plan`。Phase 0 视为 contract/mock harness 已落地，下一步是 readonly `CdpDriver` 和 `explicit_url overview via Browser Core V2`。
- Legacy Policy: 旧代码不因“旧”而删除；只有阻塞编译、测试、安全、理解或新主链验证时才清理。
- Revisit Trigger: 如果 Browser Core V2 readonly 闭环不能优于旧 content-script path，或旧链路依赖导致新主链无法独立验证，则重新评估保留/隔离策略。

## 2026-04-20 - Store-safe driver 优先与 CDP 后置

- Question: 不采用 `debugger` / CDP 作为默认路径时，是否应先做完整范式迁移，还是先继续优化工具。
- Decision: 默认大众/商店路径改为 `StoreSafeDriver + Agent Loop V2 minimal`。第一优先级是用现有 JS/DOM extraction 抽出 store-safe browser tool facade，并用它完成范式迁移最小闭环；`CdpDriver` 后置为 advanced/local/enterprise driver。
- Reason: 旧 MVP 的问题不是 JS/DOM 路线本身，而是工具薄、恢复弱、裁剪和 workflow 绑定过重。单独迁移 runtime 范式会变成新 loop 跑旧薄工具；先押 CDP 又会放大上架、权限、隐私和用户信任风险。
- Plan Update: `doc/plan.md` 的 Phase 1 改为 `Store-safe Browser Tool Facade`，Phase 2 改为 `Agent Loop V2 Minimal`，Phase 5 才实现 advanced `CdpDriver`。
- Revisit Trigger: 如果 store-safe explicit URL overview 无法达到最低可用质量，再评估是否把 CDP 提前为非商店高级模式，而不是替代大众默认路径。

## 2026-04-20 - Browser Core V2 参考重写岛

- Question: Browser Core V2 是否应直接铺到现有 `src/background`、`src/content` 主目录，还是建立隔离的新系统岛。
- Decision: 新建 `src/browser-core-v2` 作为参考重写岛；旧 runtime/tools/workflow/content 主链保留为历史、对照、fallback 或 harness。
- Reason: 直接散落到旧主目录会把“受控重写”变成就地大重构，后续 AI 线程容易误判新旧边界。隔离目录让新主线可独立理解、测试和接线。
- Boundary: 当前只建立 store-safe JS/DOM 默认路径和 background/content 框架，不注册 runtime-visible tool，不引入 CDP/debugger，不请求 `downloads` 权限。
- Reference: ChromeClaw 用于 browser tool 行为和测试组织参考；browser-use 只参考 DOM serializer / markdown extractor 思路，不引入依赖。
- Revisit Trigger: 如果 `src/browser-core-v2` 与旧契约重复到维护成本过高，或第一闭环需要大量复用旧 runtime 才能运行，再评估 adapter 边界。

## 2026-04-21 - 首批 LLM-visible tool contracts 冻结

- Question: 在切换 bounded plan runner 之前，是否应先冻结第一批可见工具契约，以及按什么粒度拆旧 workflow。
- Decision: 先冻结四个首批工具契约：`browser.search`、`browser.webDetail`、`browser.siteOverview`、`skill.commerceResearch`。其中 `public_research` 按旧 workflow 语义拆为 `search -> webDetail -> 汇总` 的可复用工具边界；`commerce_search` 暂保留为黑盒 skill，不在第一步拆细。
- Contract Boundary:
  - `browser.search` 只处理浏览器第一页自然结果，规则过滤并保持页面顺序，不暴露 `topK`，不做 LLM reorder。
  - `browser.webDetail` 负责单页高价值读取，不负责同站多页概览。
  - `browser.siteOverview` 负责明确站点入口、主页与同站一跳概览，可内部复用 `webDetail` 能力。
  - `skill.commerceResearch` 延续旧 JD 搜索、抽取、过滤、候选整理和总结路径，但对外只暴露黑盒 skill 结果。
- Metadata Decision: 首批工具统一冻结 `name / description / inputSchema / outputSchema / sideEffectLevel / parallelPolicy / requires / produces / timeoutMs / failurePolicy`。`browser.*` 默认为 `read_only`，`skill.commerceResearch` 为 `external_navigation`；高风险提交动作统一 `blocked`。
- Internal Boundary: `open / navigate / observe / read / extractLinksAndControls` 继续属于 Browser Core V2 内部动作，不进入首批 `LLM-visible tool catalog`。
- Reason: 如果先做 runner 再定工具边界，最终只会把旧 workflow 节点换个壳继续调度；先冻结可见工具契约，第二步再接 runner，才能让执行范式切换真正围绕新工具集发生。
- Reference: `doc/reference/browser_core_v2_first_party_tools.md`。

## 2026-04-22 - 首批工具静态 registry 与默认 handlers

- Question: 首批工具契约冻结之后，下一步应先跑“完整测试”，还是先让这些工具变成可注册、可校验、可 mock 执行的静态 ToolRegistry。
- Decision: 先补静态 registry、注册校验、默认 handlers、mock 验证和最小集成测试；不先做旧 runtime 主循环接线，也不先跑与新链路无关的全量测试。
- Registry Shape: Browser Core V2 首批工具 registry 要求 key 与首批工具名完全一致，每个 entry 都包含 contract 与 handler。`executeFirstPartyTool` 统一做 input schema 校验、handler 执行和 output schema 校验。
- Handler Boundary:
  - `browser.search` 通过 BrowserDriver 打开搜索页并从第一页 links 做规则过滤。
  - `browser.webDetail` 通过 BrowserDriver 打开显式 URL，返回裁剪后的单页详情。
  - `browser.siteOverview` 通过 BrowserDriver 串行读取入口页与同站一跳页面。
  - `skill.commerceResearch` 通过 delegate/adapter 承接旧黑盒 commerce 流程；未接 delegate 时返回 `blocked`，而不是伪造执行能力。
- Reason: 现在的风险不在“测试不够多”，而在“新工具还没变成真正可注册、可调用的对象”。先把 registry 站住，后续 runtime 接线与 runner 测试才有真实目标。
## 2026-04-22 - Browser Core V2 runtime loop cutover

- Question: After first-party contracts and registry landed, should the repo keep the legacy runtime loop as the main execution path.
- Decision: Keep the `BrowserAgentRuntime` shell and public-state protocol, but switch the main execution path to a Browser Core V2 runner.
- Runtime Shape:
  - `createInitialSession()` now compiles `taskSpec` during bootstrap and builds a coarse display plan for the side panel.
  - `runBrowserCoreV2Loop()` dispatches by `taskSpec.taskType`, not by legacy `allowedTools`.
  - `direct_answer` goes straight to the legacy finalizer adapter.
  - `public_research` runs `browser.search -> browser.webDetail(batch) -> finalizeResearchResult`.
  - `site_overview` runs `browser.search? -> browser.siteOverview -> finalizeResearchResult`.
  - `commerce_search` runs `skill.commerceResearch -> finalizeCommerceResult`, with the skill delegate wired to legacy helper tools instead of the legacy runtime loop.
- Driver Decision: Until StoreSafeDriver chrome wiring is complete, the new loop uses a temporary runtime BrowserDriver adapter over `chrome.tabs + sendMessageToTab + content bridge`.
- Public State Decision: `SessionPublicState` stays stable. Only the displayed plan/current tool semantics shift from legacy workflow steps to coarse Browser Core V2 tools.
- Revisit Trigger: Replace the temporary runtime BrowserDriver adapter after StoreSafeDriver chrome wiring and real-browser S1 are stable.
## 2026-04-22 - Round-End Finalize Or Replan Gate

- Question: How should Browser Core V2 move from "one fixed executor round then finalize" toward a bounded multi-round agent loop without reintroducing per-tool workflow branching?
- Decision: Add one shared round-end decision layer for all non-direct tasks. Each round now follows `execute bounded tool round -> observation digest -> decideRoundAction -> finalize | replan | abort`.
- Why: The missing piece was not more tools or finer browser primitives, but a generic planner/replanner layer. A single round-end decision contract keeps the loop generic and avoids hardcoding per-tool second-pass logic.
- Boundaries:
  - `direct_answer` remains single-round and bypasses the decision gate.
  - Existing finalizers remain the user-facing answer writers.
  - `replan` only patches the current task type; it does not freely rewrite the task into another task family.
  - The first implementation keeps `maxRounds = 2`.
- Follow-up: If this stabilizes in real-browser use, the next step is to lift round planning itself into an explicit bounded `RoundPlanSchema` instead of keeping the first round executor-fixed.
