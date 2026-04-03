# Browser Agent Agent Guide

## 1. 核心定义

本项目当前主线只有一个核心定义：

`Agent = LLM + Tools + Memory + Runtime`

其中：

- `LLM` 是决策核心，负责任务理解、静态初始 plan、下一步 tool 选择、step 状态更新和最终输出
- `Tools` 是可复用能力单元，负责执行细节、脏活、局部恢复和结构化结果返回
- `Memory` 只保留结构化工作记忆，不保留低价值页面噪音
- `Runtime` 是最小保障层，负责执行宿主、预算、停止、恢复、持久化和状态广播，不是业务主脑

当前执行范式为：

`LLM plan-driven tool orchestration`

## 2. 当前范围

当前代码已跑通的任务模块：

- `commerce_search`
  - 面向京东站内商品搜索、提取、过滤和推荐输出
- `public_research`
  - 面向 Google 公网搜索、来源筛选、逐页读取和调研汇总

当前不应假设：

- 已支持多站点通用 adapter
- 已支持执行中复杂 plan 改写
- 已支持下单、支付或其他高风险执行
- 已支持开放 raw DOM 原子动作给 LLM

## 3. 文档入口

优先读取以下文档：

- [doc/spec.md](./doc/spec.md)
- [doc/constraints.md](./doc/constraints.md)
- [doc/plan.md](./doc/plan.md)
- [doc/thread_bootstrap.md](./doc/thread_bootstrap.md)
- [doc/status.md](./doc/status.md)
- [doc/acceptance.md](./doc/acceptance.md)
- [doc/writing_rules.md](./doc/writing_rules.md)
- [doc/pitfalls.md](./doc/pitfalls.md)

说明：

- `README.md` 是项目总览，不是设计真相
- 设计、红线、路径、现状、验收以 `doc/` 下对应文档为准
- `doc/pitfalls.md` 是专题复盘文档，用于记录已确认坑点、原因和处理方法
- 线程实例优先查看 `doc/threads/active/`

## 4. 工作约束

处理任务时优先遵守：

- 先判断当前目标属于哪个 `task module`
- 优先最小必要改动，不擅自重构无关文件
- 不让 `LLM` 承担 raw DOM 动作、selector 和等待细节
- 优先把稳定语义能力封装成 `runtime-visible tool`
- 不把 tool 内部局部恢复暴露成一串原子动作让 `LLM` 编排
- 不把代码可直接得到的事实和原始噪音重复塞给 `LLM`
- 信息不足时先明确不确定性，不自行发明业务规则

## 5. 文档更新规则

按职责更新，不要混写：

- 设计变化：更新 `doc/spec.md`
- 红线变化：更新 `doc/constraints.md`
- 迁移路径变化：更新 `doc/plan.md`
- 新线程启动上下文变化：更新 `doc/thread_bootstrap.md`
- 代码现状变化：更新 `doc/status.md`
- 验收口径或验收状态变化：更新 `doc/acceptance.md`
- 文档写法或拆分规则变化：更新 `doc/writing_rules.md`
- 踩坑复盘、原因分析或处理原则沉淀：更新 `doc/pitfalls.md`
- 长期决策沉淀：新增或更新 `doc/adr/`
- 线程局部讨论与交接：写入 `doc/threads/active/` 或 `doc/threads/closed/`

如果发生范式切换，先归档旧文档到 `doc/history/`。

## 6. 当前阶段判断题

任何新实现都应先回答：

- 这件事该由 `LLM` 决策，还是该封进 `Tool`
- 这段上下文是否值得进入 `Memory`
- 这一步是否值得成为 `runtime-visible tool`
- 这一步是否只是 `tool-internal step`
- 这一步是否必须进入 `Runtime` 的最小执行循环
- 这次变更应更新哪一份文档，而不是顺手改很多份

Updated: 2026-04-03
