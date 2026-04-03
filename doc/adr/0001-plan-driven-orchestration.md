# ADR 0001: 采用 Plan-Driven Tool Orchestration

## 1. 背景

项目原先采用 `phase-driven deterministic loop`。

该方案的优点是：

- 两条链路已能跑通
- 固定 workflow 易于回归

但问题也已经明确：

- `Runtime` 承担了过多任务推进职责
- 新能力很容易被迫改造成新的固定 workflow
- `LLM` 不是决策核心，而更像固定流程中的填空器

## 2. 决策

当前主线改为：

`LLM plan-driven tool orchestration`

同时明确：

- `LLM` 是决策核心
- `Tools` 是能力单元
- `Memory` 是结构化工作记忆
- `Runtime` 是最小保障层

当前 v1 约束：

- 先使用静态初始 plan
- 暂不支持执行中复杂 plan 改写
- 保留 runtime 最小护栏

## 3. 被放弃方案

### 3.1 继续堆固定 workflow

放弃原因：

- 新任务模块会不断把 runtime 推回状态机中心
- tool 难以独立组合

### 3.2 直接开放 raw DOM 原子动作给 LLM

放弃原因：

- 已有踩坑表明这会让执行快速失稳
- 等待、selector、重试等脏活不应暴露给 LLM

## 4. 影响

直接影响：

- `spec.md` 改写为新执行范式
- `status.md` 需要从旧实现现状转成迁移 checkpoint
- `acceptance.md` 需要拆成“旧基线 + 新迁移验收”
- 代码需要新增 `PlanStep`、`ToolResult` 和新的 runtime 最小执行循环

后续影响：

- 新能力优先先封装为稳定 tool，再接入 plan
- 任务模块不再默认绑定固定 workflow

Updated: 2026-04-03
