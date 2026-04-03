# Browser Agent 新线程启动词

## 1. 当前前提

项目当前定义：

`Agent = LLM + Tools + Memory + Runtime`

当前支持两类任务：

- `commerce_search`
- `public_research`

## 2. 必须先记住的规则

- `LLM` 负责任务理解、任务类型判断、查询词生成和最终汇总
- `Tools` 负责页面动作、等待、提取、过滤、逐页读取，以及同一 tool 契约内的局部恢复
- `Memory` 只保留结构化状态
- `Runtime` 仍是 phase-driven 的确定性循环，并负责 tool 返回后的任务级判断与调度

## 3. 不要回到旧思路

不要把系统重新拉回以下方向：

- 让 `LLM` 决定细粒度 DOM 动作
- 把等待、重试、selector fallback 暴露给 `LLM`
- 把“同一 tool 内的恢复”和“tool 返回后的任务调度”混成一层
- 把大量页面噪音塞进上下文
- 在没有真机验收前，过早扩到多站点通用架构

## 4. 新线程优先回答的问题

1. 当前任务属于哪个 `taskType`
2. 下一步最小闭环是什么
3. 这件事应该放进 `LLM`、`Tool`、`Memory` 还是 `Runtime`
4. 这是 tool 契约内恢复，还是 tool 返回后的任务级调度
5. 这次变更应更新哪一份文档

## 5. 可直接复制给 agent 的提示

```text
项目当前定义为：
Agent = LLM + Tools + Memory + Runtime

当前支持两类任务：
- commerce_search：京东商品搜索、提取、过滤、推荐输出
- public_research：Google 搜索、来源筛选、逐页读取、调研汇总

必须遵守：
- Runtime 仍是 phase-driven 的确定性循环
- LLM 不负责细粒度 DOM 动作
- Tools 负责等待、重试、提取、过滤和 tool 契约内的局部恢复
- Runtime 负责 tool 返回后的任务级判断与下一步调度
- 文档按单一职责更新：设计改 spec，现状改 status，验收改 acceptance

请先判断当前任务属于哪个 taskType，再给出最小必要改动方案。
```

Updated: 2026-04-03
