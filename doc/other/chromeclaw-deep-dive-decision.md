# ChromeClaw 深度调研决策报告

Updated: 2026-04-17

## Executive Decision

Decision: partially adopt

Reason:
ChromeClaw 不应被当成普通 Playwright/CDP 替代品看待，而应作为通用浏览器 agent 的重要参考实现。`debugger` 权限对大众用户产品不是决定性阻力；它更像能力与信任说明问题，而不是否决条件。当前不建议直接 fork 的主要原因不是权限，而是 ChromeClaw 的工程体量、非核心集成范围和状态复杂度明显大于当前 MVP。更稳妥的路线是保留当前 MVP 的可审计执行骨架，同时加速吸收 ChromeClaw 的 CDP/browser capability、tool registration、Provider/Options 配置和 offscreen 经验，把现有 workflow 当作通用浏览器 agent 的验证脚手架。

Adopt:
- 强化采用 ChromeClaw 的 `browser` 工具能力：tab 管理、CDP snapshot、screenshot、click/type、console/network 观察、detach 后 reattach。
- 借鉴 `ToolRegistration` + TypeBox schema + per-tool enablement 的注册方式，但保留当前 MVP 的高层 `ToolResult` 合约。
- 借鉴 provider/model/options UI、首轮模型配置、工具开关、日志查看与 IndexedDB 持久化思路。
- 借鉴 offscreen document 的工程经验，先作为 MV3 长任务和 worker 承载的后备方案。
- 将 ChromeClaw 的自由浏览器 agent 模式作为目标形态参考，但在当前 MVP 中用风险分级、用户可见状态和高风险确认逐步开放。

Do not adopt:
- 不 fork ChromeClaw 作为主工程。
- 不把 ChromeClaw 的 raw `debugger` 和 `execute_javascript` 直接暴露给 LLM 作为默认能力；`browser` 可以成为通用 agent 的核心工具，但需要安全 envelope。
- 不继承 WhatsApp、Telegram、voice、scheduler、workspace files、broad memory journal、Google Gmail/Drive/Calendar 等非 MVP 主线功能。
- 不默认继承 `cookies`、`identity`、`declarativeNetRequest` 等与通用浏览器 agent 主链路无关的高敏权限。

First experiment:
以当前 MVP 为主代码基底，新增一个受控 `CdpDriver` spike，用 ChromeClaw 的 `browser.ts` / `cdp.ts` 作参考，优先服务 `site_overview explicit_url`，同时保留向通用浏览器 agent 模式扩展的接口。实验范围限定为：打开 URL、读取页面 snapshot、提取一跳站内高价值链接、读取正文、截图失败证据、形成当前 `SourceFactCard` 和 `FinalResult`。完成后增加第二阶段实验：在低风险网页上开放 explain current page、open URL、find links、click by ref、type into low-risk field。

Risks:
- `debugger` 权限会触发浏览器远程调试提示；对大众用户不是否决项，但需要产品解释和明确的运行状态提示。
- ChromeClaw 的 browser snapshot 基于 `DOM.getDocument({ pierce: true })` 和自建 refMap，不等同于当前 MVP 的 `SemanticSnapshot`，需要兼容层。
- ChromeClaw action 能力偏底层，缺少当前 MVP 的 `allowedTools`、任务终态和 workflow 验证边界；通用 agent 需要把这些边界改造成安全 envelope，而不是永久限制能力。
- 本报告没有运行 ChromeClaw 构建、加载扩展或真实 provider 任务，浏览器动作可靠性仍需 spike 验证。

Revisit trigger:
如果 `site_overview explicit_url` 的 `CdpDriver` spike 在 3 个公共站点上显著优于当前 content-script driver，就进入低风险通用浏览器 agent 实验。只有当 ChromeClaw shell 明显快于当前 UI 演进，并且非核心功能可低成本剥离时，才重新讨论 fork。

## Evidence Summary

ChromeClaw 是一个完整浏览器内 AI assistant 平台，而不是单纯 browser-control 库。证据来自 `README.md`、`package.json`、`chrome-extension/manifest.ts` 和源码结构：

- 技术栈：React 19、TypeScript、Turborepo、pnpm 10.11.0、Vite、Dexie、pi-mono。
- 本地运行：README 标明 `pnpm install`、`pnpm build`，加载 `dist/`，用户自行配置 API key；本次未执行构建。
- 核心链路：Side Panel 通过 `chrome.runtime.Port` 发起 `llm-stream`，background 调用 `runAgent`，再经 pi-mono stream 和 tool calling 返回 UI。
- 权限：manifest 默认包含 `<all_urls>`、`storage`、`scripting`、`tabs`、`notifications`、`sidePanel`、`alarms`、`debugger`、`offscreen`、`identity`、`cookies`、`declarativeNetRequest`。
- 数据：Dexie `chromeclaw` 数据库 v13 包含 `agents`、`chats`、`messages`、`artifacts`、`workspaceFiles`、`memoryChunks`、`scheduledTasks`、`taskRunLogs`、`embeddingCache`。
- 工具：`tools/index.ts` 注册 web search、document、browser、workspace、scheduler、memory、fetch、deep research、agents、execute JS、Google、debugger、subagent。
- 默认工具配置：`tool-config-storage.ts` 默认启用大量工具，包括 `browser`、workspace、memory、scheduler、deep research、subagent、execute JS；Google 工具默认关闭。

当前 MVP 的对比证据来自 `doc/spec.md`、`doc/constraints.md`、`src/background/runtime/loop.ts`、`src/shared/types.ts`、`src/content/scanner.ts`、`src/content/actions.ts`：

- 当前主线是 `Agent = LLM + Tools + Memory + Runtime` 和 `LLM plan-driven tool orchestration`。
- Runtime 有静态 `PlanStep`、`allowedTools`、预算、同工具重试、无进展 guardrail。
- 工具返回高层 `ToolResult`，内容脚本原子动作返回低层 `ActionResult`。
- 观察模型已有 `SemanticSnapshot`、`InteractiveElement`、`PageFacts`、`SourceFactCard`。
- 最终结果统一为 `success / partial / failed / blocked`。

## Architecture Fit

ChromeClaw 的 assistant shell 对当前 MVP 有较高参考价值。它已经有 Side Panel、chat history、artifact、model setup、tool visible parts、reasoning display、FirstRunSetup 和 Options tab。它的默认产品目标接近个人全能助理，其中 browser automation 与当前通用浏览器 agent 目标一致；问题在于渠道、语音、cron、多 agent、workspace files、memory journal 和 Google 工具等范围明显超过第一阶段 MVP。

当前 MVP 的高价值不应丢弃，但应重新理解为通用浏览器 agent 的训练轮和护栏，而不是长期产品边界：

- 静态 plan + `allowedTools` 让任务执行边界清楚。
- 高层工具封装稳定语义能力，避免 LLM 直接编排 raw DOM 或 CDP 动作。
- `ToolResult` 与 `ActionResult` 分层，有利于把浏览器原子失败限制在 tool 内部恢复。
- `FinalResult` 终态合约对用户可审计、对历史归档友好。
- `site_overview` 已经定义了浅层站点概览边界，适合作为浏览器能力层 spike 和通用模式的第一个可评估任务。

ChromeClaw 可借鉴但不宜照搬：

- 它的 agent loop 是开放工具调用循环，依赖 tool-loop detection 和 context compaction 护栏；当前 MVP 应吸收这个方向，但先用任务级 workflow 学习可靠边界，再逐步放宽到通用 agent。
- 它的工具注册和 Options 配置成熟，但工具粒度偏宽，默认暴露能力过多。
- 它的 IndexedDB 模型完整，但包含许多当前不需要的数据域，直接迁移会放大状态复杂度。

## Browser Capability Layer

ChromeClaw 的 `browser.ts` 是本次最值得借鉴的模块。它提供：

| Capability | Implementation | Uses CDP | Structured | MVP mapping | Risk |
| --- | --- | --- | --- | --- | --- |
| list tabs | `chrome.tabs.query` | no | text | Tab lifecycle API | 低 |
| open/focus/close tab | `chrome.tabs.create/update/remove` | no, close may detach | text | TabHost/CdpDriver | 中 |
| navigate | `Page.navigate` fallback `tabs.update` | yes | text | `NAVIGATE` action | 中 |
| content extraction | `Runtime.evaluate`/selector path | yes | text | page facts fallback | 中 |
| snapshot | `DOM.getDocument` with `pierce: true` + refMap | yes | text refs | compatibility layer to `SemanticSnapshot` | 中高 |
| screenshot | `Page.captureScreenshot` + sanitization | yes | image result | evidence artifact | 中 |
| click by ref | `Runtime.callFunctionOn(this.click())` fallback coordinates | yes | text | internal action only | 高 |
| type by ref | focus/clear + `Input.insertText` | yes | text | internal action only | 高 |
| evaluate JS | `Runtime.evaluate` | yes | text/json | reject by default, internal debug only | 高 |
| console/network | debugger event ring buffers | yes | text | debug artifact | 中 |

关键观察：

- Snapshot 使用 `DOM.getDocument({ depth: -1, pierce: true })`，可穿透 shadow DOM，ref 绑定 `backendNodeId`，适合 CDP 后续动作。
- Click 先尝试 DOM `this.click()`，失败后用 `DOM.getBoxModel` 和 `Input.dispatchMouseEvent` 坐标点击。
- Type 使用 `Runtime.callFunctionOn` 聚焦并清空，再用 `Input.insertText`，比纯 content script 更接近真实输入，但仍需要当前 tab active。
- Navigate 会清空 stale refMap，attach 失败时 fallback 到 `chrome.tabs.update`。
- `cdp.ts` 有 detach/not attached 后 reattach 一次并重新 enable `Runtime/Network/Page/DOM` 的模式，值得移植。

建议目标形态：

- General assistant mode：browser 是核心工具，可见能力包括当前页解释、打开 URL、切 tab、截图、找链接、click by ref、低风险输入。
- Reliable workflow mode：作为通用 agent 能力的验证与沉淀路径，用高层工具封装已知可靠流程；它不是最终产品边界。
- High-risk mode：提交表单、登录、发送消息、删除、上传、付款、checkout、账户设置、运行任意 JS、直接 debugger/CDP send 必须确认或默认禁用。

## Tool, Agent Loop, Storage and UI

Tool system:

- ChromeClaw 的 `ToolRegistration` 用 name、label、description、TypeBox schema、executor、formatResult 建立统一注册。
- `getAgentTools` 根据 `toolConfigStorage.enabledTools` 动态启用工具，并支持 `chromeOnly`、`excludeInHeadless`、agent custom tools。
- `executeTool` 做 schema validation、timeout 和 fallback error。
- 建议迁移概念，不迁移完整工具清单。当前 MVP 的 registry 应保持高层语义工具，未来可吸收 TypeBox schema 和 per-tool enablement。

Agent loop:

- ChromeClaw 用 pi-mono agent loop，模型可连续产生 tool calls，tool results 回填上下文，直到没有 tool call 或被中断。
- 它已有 `AbortSignal`、stream event、tool execution start/end、tool-loop detection、context overflow retry、tool result truncation 和 compaction。
- 风险是缺少当前 MVP 的任务级 `allowedTools` 和 plan step 成功条件；可靠 workflow 迁进去可能需要反向约束它的自由调用能力。

Storage and memory:

- ChromeClaw 的 IndexedDB schema 更完整，适合长期 chat、artifact、workspace、memory、scheduler。
- 当前 MVP 只需要结构化 working memory、session archive 和 source facts。直接迁移 ChromeClaw memory journal 会引入长文本记忆、embedding、agent scope 等复杂度。
- 建议只借鉴 Dexie 分表和 migration 组织方式，不迁移完整存储形状。

UI/UX:

- 可借鉴 Options 的 tab grouping：Control、Agent、Settings。
- 可借鉴 model setup、tool toggle、logs、usage、artifact 和 tool call rendering。
- 当前 MVP 的 timeline、stop、final result 与 workflow 状态仍更贴近可审计浏览器任务。

## Security and Permissions

| Permission | ChromeClaw why | MVP now | Optional? | User-facing risk | Mitigation |
| --- | --- | --- | --- | --- | --- |
| `debugger` | CDP attach、snapshot、screenshot、input、console/network | 不应默认 | yes, experimental | 浏览器显示远程调试提示，企业环境敏感 | 只在 CDP spike 或高级模式启用，明确解释 |
| `<all_urls>` | 任意网页工具、fetch、content/browser automation | 当前 host permissions 已接近 | partly | 访问范围过大 | 延迟到用户发起任务，限制实际采集和归档 |
| `scripting` | 注入脚本、content execution | 已需要 | no | 页面读写能力 | 保持高层工具封装 |
| `tabs` | tab list/open/focus/navigate | 已需要 | no | 浏览历史/URL 可见 | 只记录任务必要 URL |
| `offscreen` | channel worker、本地模型/voice、长连接 | 暂不需要默认 | yes | 后台常驻感知 | 只在出现 MV3 长任务失败后引入 |
| `identity` | Google OAuth | 当前不需要 | yes | 账号授权敏感 | 不纳入 MVP 默认 |
| `cookies` | Web/channel/provider 辅助 | 当前不需要 | yes | Cookie 访问高敏 | 拒绝默认采纳 |
| `declarativeNetRequest` | WhatsApp origin/header 规则 | 当前不需要 | yes | 网络规则修改敏感 | 拒绝默认采纳 |
| `alarms` | scheduler、watchdog、polling | 当前不需要或低优先 | yes | 后台任务感知 | 仅 scheduler/offscreen 需要时申请 |

MVP 默认权限建议：

- 保持 `sidePanel`、`tabs`、`activeTab`、`scripting`、`storage`、必要 host permissions。
- `debugger` 可以进入 browser agent 公开 MVP 路径，但必须配套清晰说明、运行状态提示、可停止机制和高风险动作确认。
- `identity/cookies/declarativeNetRequest` 明确排除，除非后续产品范围包含 Google 工具或渠道集成。

## Migration Recommendation

模块分级：

| Area | Classification | Rationale |
| --- | --- | --- |
| Browser CDP primitives | adopt aggressively via rewrite | 能力强，适配 `ActionResult`、`SemanticSnapshot` 和安全边界后应成为主能力 |
| `cdpSendWithReattach` | conceptually copy | detach 恢复模式直接有价值 |
| Tool registration/schema | conceptually copy | TypeBox/schema/enablement 有价值，工具列表不照搬 |
| Options model/tool UI | adopt later | 当前 MVP 可先保持轻量，后续配置复杂时迁移思路 |
| Side Panel chat shell | reference only | 已有 MVP UI 更贴近 workflow timeline |
| Agent loop | study and gradually converge | 自由 tool calling 是目标方向，但需要先吸收当前 `allowedTools` 的安全经验 |
| Memory journal/embeddings | adopt later selectively | 先保留 structured memory |
| Deep research tool | reference only | 当前 `public_research` 已有受控来源模型 |
| Offscreen manager | adopt later | 等真实 MV3 长任务失败触发 |
| Workspace files/skills | defer | 当前不是 browser-agent MVP 核心 |
| Channels/voice/scheduler/Google | ignore for now | 产品范围外且引入高权限/复杂度 |
| Debugger raw tool | internal only | `debugger` permission 可接受，但 raw CDP send 不应默认交给 LLM |
| Execute JavaScript | reject default | 高风险，必须单独安全审查 |

建议迁移路径：

1. 在当前 MVP 新增内部 `BrowserCapabilityLayer` 接口，先不破坏现有 runtime-visible tools。
2. 保留现有 `ContentScriptDriver`，新增实验 `CdpDriver`。
3. 先实现 `openTab/navigate/snapshot/screenshot/readContent/click/type`，其中 click/type 只用于低风险或 workflow 内部动作。
4. 将 ChromeClaw snapshot 转换为当前 `SemanticSnapshot` 或新增兼容 adapter。
5. 用 `site_overview explicit_url` 做首个 spike，复用现有 `SourceFactCard` 和 `FinalResult`。
6. 验证通过后，再考虑 `console/network` 作为 debug artifact。
7. 用确认规则保护登录、发送、删除、付款、上传等动作；`evaluate` 和 raw debugger send 仍单独安全审查。

## Workflow Migration Fit

| Workflow | Current value | ChromeClaw equivalent | High-level tool fit | Migration complexity | Should migrate first |
| --- | --- | --- | --- | --- | --- |
| `direct_answer` | 稳定问答和追问兜底 | 普通 chat | 不需要迁移 | 低 | no |
| `public_research` | 多来源候选、source facts、final synthesis | web_search + web_fetch + deep_research | 可借鉴 deep research，但不照搬 | 中 | no |
| `site_overview` | 明确 URL、浅层站点概览 | browser + fetch + snapshot | 最适合 CDP spike | 中 | yes |
| `commerce_search` | 京东站内搜索和候选过滤 | browser automation | 高风险，站点反爬和登录复杂 | 高 | no |

First experiment details:

- Input: explicit URL only.
- Tools exposed to LLM: unchanged high-level `resolveEntryPoint`、`collectResearchCandidates`、`readResearchSourceFacts`、`finalizeResearchResult` style path.
- Internal driver: add `CdpDriver` only behind tool implementation.
- Success: final report lists homepage, one-hop high-value pages, skipped pages, blockers, source facts.
- Failure: must return `partial/failed/blocked` with screenshots or snapshot excerpts where available.

## Evaluation Matrix

| Area | Score | Notes |
| --- | ---: | --- |
| Product shell | 3 | Chat/options/history 成熟，但产品范围过宽 |
| Agent loop | 3 | 流式和 tool loop 护栏成熟，但不适合直接承载可靠 workflow |
| Tool registry | 4 | TypeBox schema、enablement、formatResult 值得借鉴 |
| Browser capability layer | 4 | CDP 能力完整，是主要采纳对象 |
| Observation model | 3 | refMap 和 CDP DOM 有用，但需适配 `SemanticSnapshot` |
| Action reliability | 3 | CDP 输入强于 content script，但需要真实站点验证和安全确认 |
| MV3 lifecycle handling | 3 | offscreen 用于 channels/worker，provider streaming 仍靠 SW keepalive |
| Storage and memory | 3 | Dexie/migration 可靠，数据域过宽 |
| Provider abstraction | 4 | 多 provider、local/web provider 和 model config 参考价值高 |
| UI/UX | 3 | 设置页强，browser task timeline 和审批模型不足 |
| Security/permissions | 3 | `debugger` 对大众用户可接受，但仍要裁剪无关高敏权限 |
| Workflow migration fit | 4 | workflow 是通用 browser agent 的验证脚手架，`site_overview` 适合先迁 |
| Testability | 4 | 单元测试覆盖较广，browser 工具有测试，但本次未实跑 |
| Maintainability | 3 | 模块齐全但范围大，直接 fork 会带来长期维护成本 |

Interpretation:
ChromeClaw 是强参考实现，短期仍不作为主基底。最高分集中在 capability、配置工程和通用 agent 方向；主要风险从“权限不可接受”调整为“需要清晰安全 envelope 和范围裁剪”。

## Residual Unknowns

- 本次没有运行 `pnpm build`、`pnpm test` 或加载 ChromeClaw `dist/`。
- 未配置真实 provider，因此没有验证 tool calling、context compaction、stream retry 的端到端表现。
- 未在真实网站运行 CDP browser action，因此 action reliability 只基于源码判断。
- 未检查当前 MVP 与 ChromeClaw 两边所有 UI 细节，只覆盖决策相关入口。
- ChromeClaw README 存在终端显示 mojibake，不影响代码证据，但报告中的外部描述以源码为主。

## Final Recommendation

当前项目应保持现有 MVP 为主线，但目标应明确转向通用浏览器 agent。现有 workflow 不是终点，而是学习和验证通用流程的脚手架。最稳妥的路线是先把 ChromeClaw 的 CDP snapshot、reattach、screenshot、tab lifecycle、click/type 经验重写成 `CdpDriver`，用 `site_overview explicit_url` 验证价值；验证通过后，尽快进入低风险通用浏览器 agent 模式。`debugger` 权限不再作为主要阻力，重点改为用户可见控制、高风险动作确认和无关高敏权限裁剪。
