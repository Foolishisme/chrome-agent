# Browser Agent Agent Guide

## 1. 启动基线

本项目当前核心定义：

`Agent = LLM + Tools + Memory + Runtime`

当前执行范式：

`LLM plan-driven tool orchestration`

详细设计以 [doc/spec.md](./doc/spec.md) 为准，红线以 [doc/constraints.md](./doc/constraints.md) 为准。

## 2. 当前模块

当前主线模块：

- `direct_answer`
- `commerce_search`
- `public_research`
- `site_overview`

当前不应假设：

- 已支持多站点通用 adapter。
- 已支持执行中复杂 plan 改写。
- 已支持下单、支付或其他高风险执行。
- 已支持开放 raw DOM 原子动作给 LLM。

## 3. 默认入口

默认只读取：

- [doc/spec.md](./doc/spec.md)
- [doc/constraints.md](./doc/constraints.md)
- [doc/status.md](./doc/status.md)
- 当前任务需要的单一日志：
  - [doc/logs/exec.md](./doc/logs/exec.md)
  - [doc/logs/review.md](./doc/logs/review.md)
  - [doc/logs/design.md](./doc/logs/design.md)

按需再查：

- [doc/interaction.md](./doc/interaction.md)
- [doc/acceptance.md](./doc/acceptance.md)
- [doc/writing_rules.md](./doc/writing_rules.md)
- [doc/reference/](./doc/reference/)
- [doc/history/](./doc/history/)

文档职责、更新规则和降级机制以 [doc/writing_rules.md](./doc/writing_rules.md) 为准。

## 4. 硬提醒

- 先判断当前目标属于哪个 `task module`。
- 默认做最小必要改动，不擅自重构、重命名或修改无关文件。
- 不让 `LLM` 承担 raw DOM 动作、selector 和等待细节。
- 优先把稳定语义能力封装成 `runtime-visible tool`。
- 不把 tool 内部局部恢复暴露成一串原子动作让 `LLM` 编排。
- 不把代码可直接得到的事实和原始噪音重复塞给 `LLM`。
- 未来能力、未拍板方向、非当前范围事项，只能记录为建议、风险或后续项；不得顺手实现。
- 信息不足时先明确不确定性，不自行发明业务规则。

## 5. 当前阶段判断题

任何新实现都应先回答：

- 这件事该由 `LLM` 决策，还是该封进 `Tool`？
- 这段上下文是否值得进入 `Memory`？
- 这一步是否值得成为 `runtime-visible tool`？
- 这一步是否只是 `tool-internal step`？
- 这一步是否必须进入 `Runtime` 的最小执行循环？
- 这次变更应更新哪一份文档？

Updated: 2026-04-17
