# Browser Tool Migration Plan

## 1. 定位

本文档是当前 active migration plan。

当前核心任务：

`参考 ChromeClaw，分阶段迁移/重写浏览器工具集，构建 BrowserCapabilityLayer，并用现有 workflow 作为验证 harness。`

本计划完成并进入稳定实现后，应归档到 `doc/history/`，不长期保留 active `doc/plan.md`。

## 2. 总原则

- 认知上先完成通用浏览器 Agent 范式切换。
- 工程上先迁移 browser tools，而不是先重写 runtime。
- workflow/module 暂时保留为验证场，不作为长期产品边界。
- ChromeClaw 只作为 browser/CDP/tool 设计参考，不直接 fork。
- Memory、subagent、cron、channel、Google identity 等非 browser capability 能力后置。

## 3. 阶段拆分

### Phase 0 - 接口定界

目标：

- 定义 `BrowserCapabilityLayer` 接口。
- 定义 driver contract、snapshot、target ref、action result、page problem、risk level。
- 建立 mock driver 和最小测试夹具。

验收：

- 不改变现有 workflow 行为。
- 后续 tools 可以只依赖接口，不直接依赖 CDP 或 content script。
- 明确哪些能力是 runtime-visible tool，哪些只是 tool-internal step。

### Phase 1 - 只读观察

目标：

- 实现只读 `CdpDriver` 子集：tab info、navigate/open/focus 的最小支持、snapshot、screenshot。
- 建立页面裁剪和结构化观察结果：title、url、main text、links、controls、problem detection。

验收：

- `site_overview explicit_url` 能用新观察层读取入口页。
- 长页面不会把原文直接塞给 LLM。
- 404、登录墙、空正文、不可读页面能返回结构化失败原因。

### Phase 2 - 导航生命周期

目标：

- 完成 tab lifecycle、navigate、reload、wait for stable、attach/reattach、fallback。
- 处理 SPA/hash route、导航失败、tab 失焦和刷新后的恢复。

验收：

- `site_overview explicit_url` 的主页和一跳页读取能完整走 `BrowserCapabilityLayer`。
- 导航失败不直接中断整个任务，能返回 partial success。

### Phase 3 - 低风险页面动作

目标：

- 实现 click、type、press、scroll 的受控子集。
- 引入 action risk 分级：read-only、low-risk write、medium-risk submit、high-risk irreversible。
- 动作前后重新 observe，stale target 可重新 snapshot。

验收：

- 支持搜索框输入、展开菜单、打开链接、滚动和普通草稿填写。
- 下单、支付、删除、发送不可撤回内容等高风险动作默认 blocked 或要求确认。

### Phase 4 - 工具内部恢复、批量读取、裁剪

目标：

- 把重试、fallback、页面裁剪、批量读页和部分成功收口在 tool 内。
- 建立受限并发读取和 result trimming。

验收：

- 单个 tool 能完成一批候选页面读取并返回短结构化结果。
- 页面失败不拖垮整个任务。
- LLM 主要做少量选择和汇总，而不是逐 DOM 步骤编排。

### Phase 5 - 低风险通用 Browser Mode

目标：

- 在 tools 足够厚后，开放低风险 general browser mode。
- runtime 从 workflow-first 逐步转为动态 browser tool-loop。

验收：

- 不指定 `commerce_search / public_research / site_overview` 也能完成低风险浏览任务。
- workflow 降级为 skill/harness。
- stop、takeover、高风险确认和结构化 final result 可用。

## 4. 推荐并发开发方式

先串行：

1. 冻结 `BrowserCapabilityLayer` 接口。
2. 冻结核心类型和 driver contract。
3. 冻结 feature flag / driver selection 方式。

再并发：

- Worker A: 只读 `CdpDriver`，不改 runtime 和 site_overview。
- Worker B: 页面裁剪、结构化观察、problem detection。
- Worker C: `site_overview explicit_url` driver adapter。
- Worker D: mock driver、测试夹具和边界样例。

最后串行：

- 集成 `site_overview explicit_url`。
- 收口 `ToolResult` 和 final result。
- 决定是否进入 Phase 2。

## 5. 第一实验

默认第一实验：

`site_overview explicit_url`

原因：

- 用户输入明确。
- 业务变量少。
- 能直接比较 content-script driver 与 CDP driver。
- 能验证 snapshot、screenshot、导航恢复、页面裁剪和最终汇总质量。

成功标准：

- 读取稳定性优于当前实现。
- 页面内容更短、更结构化。
- 对失败页面能给出清晰原因。
- 能输出已读页面、跳过页面、覆盖边界和未覆盖区域。

## 6. 不做事项

当前迁移阶段不优先做：

- memory 长期化。
- subagent 产品化。
- cron / channel。
- TTS / media understanding。
- Google identity / Gmail / Drive。
- cookies / declarativeNetRequest 默认权限。
- 高风险真实账户自动化。
- 完整 runtime 范式重写。

## 7. Revisit Trigger

需要重新评估本计划的情况：

- Phase 1 的 CDP snapshot 对 `site_overview explicit_url` 没有稳定性或质量收益。
- `debugger` 权限说明、stop/takeover、高风险确认无法形成可接受产品体验。
- 工具层恢复和裁剪无法明显减少 LLM 上下文噪音。
- 并发开发导致接口反复变更，集成成本高于收益。

Updated: 2026-04-20
