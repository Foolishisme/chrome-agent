# Browser Agent Agent Guide

## 1. 启动基线

本项目目标已经切换为：

`大众用户可用的通用浏览器 Agent`

当前核心定义仍是：

`Agent = LLM + Tools + Memory + Runtime`

新的主线范式是：

`LLM-driven browser tool loop over a thick BrowserCapabilityLayer`

当前代码仍保留 `LLM plan-driven tool orchestration` 与 `direct_answer / commerce_search / public_research / site_overview`，但这些 workflow/module 不再是长期产品边界。它们现在是验证场、训练轮和可沉淀为 skill/tool 的脚手架。

详细设计以 [doc/spec.md](./doc/spec.md) 为准，红线以 [doc/constraints.md](./doc/constraints.md) 为准，当前 checkpoint 以 [doc/status.md](./doc/status.md) 为准。

## 2. 当前优先级

优先推进：

- `BrowserCapabilityLayer`
- `CdpDriver`
- 页面 snapshot / screenshot / tab lifecycle
- 工具内部恢复、重试、fallback
- 页面裁剪、证据脱水、批量观察
- 低风险 general browser mode

后置推进：

- 长期 memory
- 多 agent / subagent 产品化
- 深层账户动作
- 高风险自动执行

## 3. 默认入口

默认只读取：

- [doc/spec.md](./doc/spec.md)
- [doc/constraints.md](./doc/constraints.md)
- [doc/status.md](./doc/status.md)
- [doc/plan.md](./doc/plan.md)（仅当前 active browser tool migration 阶段）
- 当前任务需要的单一日志：
  - [doc/logs/exec.md](./doc/logs/exec.md)
  - [doc/logs/review.md](./doc/logs/review.md)
  - [doc/logs/design.md](./doc/logs/design.md)

按需再查：

- [doc/interaction.md](./doc/interaction.md)
- [doc/acceptance.md](./doc/acceptance.md)
- [doc/writing_rules.md](./doc/writing_rules.md)
- [doc/other/chromeclaw-deep-dive-decision.md](./doc/other/chromeclaw-deep-dive-decision.md)
- [doc/other/browser-agent-product-flow.md](./doc/other/browser-agent-product-flow.md)
- [doc/reference/](./doc/reference/)
- [doc/history/](./doc/history/)

## 4. 硬提醒

- 先判断这次变更是在增强通用浏览器能力，还是只是在旧 workflow 内补丁。
- 优先把能力封进稳定 tool 或 `BrowserCapabilityLayer`，而不是让 runtime 继续长成 workflow 引擎。
- 不让 `LLM` 承担 raw DOM 动作、selector、等待和局部恢复细节。
- `debugger` 权限不是默认阻力，但必须配套用户可见控制、停止、接管和高风险确认。
- 不直接 fork ChromeClaw；默认选择性重写借鉴 browser/CDP/tool 能力。
- Memory 不是第一阶段差距，先补 tools、恢复重试、页面裁剪和批量观察。
- 未来能力、未拍板方向、非当前范围事项，只能记录为建议、风险或后续项；不得顺手实现。
- 信息不足时先明确不确定性，不自行发明业务规则。

## 5. 当前阶段判断题

任何新实现都应先回答：

- 这件事是在迁移 tool 能力，还是在重塑执行范式？
- 这一步应是 `runtime-visible tool`、`BrowserCapabilityLayer` 方法，还是 tool 内部步骤？
- 这段恢复/重试逻辑能否留在 tool 内，而不是暴露给 `LLM` 编排？
- 这段页面内容是否需要裁剪、脱水或结构化后再交给 `LLM`？
- 这次变更是否把 workflow 从产品边界降级为 skill/tool/harness？
- 这次变更应更新哪一份文档？

Updated: 2026-04-17
