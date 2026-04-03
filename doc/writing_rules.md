# Browser Agent 文档写作规范

## 1. 适用范围

本规范约束当前 `doc/` 下的协议层文档与线程文档：

- `doc/spec.md`
- `doc/constraints.md`
- `doc/plan.md`
- `doc/status.md`
- `doc/acceptance.md`
- `doc/thread_bootstrap.md`
- `doc/pitfalls.md`
- `doc/threads/`
- `doc/adr/`

默认不把历史快照、一次性分析稿和外部建议稿纳入本规范。

## 2. 文档分层

当前文档体系固定为四层：

1. 真理源
2. 路径层
3. 状态层
4. 沉淀层

对应关系：

- 真理源：`spec.md / constraints.md`
- 路径层：`plan.md`
- 状态层：`status.md / threads/active/`
- 沉淀层：`acceptance.md / pitfalls.md / adr/ / history/`

## 3. 总体原则

### 3.1 一份文档只回答一类问题

- `spec.md` 回答“应该是什么”
- `constraints.md` 回答“绝对不能怎么做”
- `plan.md` 回答“当前准备怎么做”
- `status.md` 回答“当前 checkpoint 在哪里”
- `acceptance.md` 回答“怎样算通过”
- `thread_bootstrap.md` 回答“新线程最先要知道什么”
- `pitfalls.md` 回答“哪些坑已经确认踩过”
- `adr/` 回答“为什么这样拍板”

### 3.2 文档服务于调度，不服务于对话复刻

优先保留：

- 规则
- 边界
- 当前结论
- 当前阻塞
- 下一步

默认不保留：

- 大段闲聊
- 原样复制的推理过程
- 可从代码直接读出的低价值细节
- 没有结论的发散想法

### 3.3 先写约束，再写路径，再写状态

更新时优先顺序：

1. 设计变化先改 `spec.md`
2. 红线变化先改 `constraints.md`
3. 迁移路径变化先改 `plan.md`
4. 当前 checkpoint 变化先改 `status.md`
5. 验收口径变化先改 `acceptance.md`

### 3.4 术语必须统一

当前主线中优先使用以下术语：

- `LLM`
- `Tools`
- `Memory`
- `Runtime`
- `task module`
- `runtime-visible tool`
- `tool-internal step`
- `PlanStep`
- `ToolResult`
- `acceptance`

## 4. 分文档规范

### 4.1 `doc/spec.md`

定位：

- 设计真相
- 架构边界
- 长于当前实现的设计基线

不应写：

- 当日进度
- 临时 TODO 堆积
- 验证日志

### 4.2 `doc/constraints.md`

定位：

- 红线
- 禁区
- 必须人工批准的高风险修改

不应写：

- 当前迁移顺序
- 当前已完成进度
- 详细历史复盘

### 4.3 `doc/plan.md`

定位：

- 当前采用的迁移路径
- 串并行依赖
- 当前明确不做的部分

不应写：

- 当前 checkpoint
- 每日进展
- 长篇架构辩论

### 4.4 `doc/status.md`

定位：

- 接力胶囊
- 当前 checkpoint

当前固定结构：

- `Current Phase`
- `Current Focus`
- `Done`
- `In Progress`
- `Blockers`
- `Rejected Paths`
- `Next Actions`
- `Needs Human Decision`

不应写：

- 大段设计重述
- 冗长实现细节
- 长期路线图

### 4.5 `doc/acceptance.md`

定位：

- 验收项
- 验证方式
- 当前状态

要求：

- 验收项必须可验证
- 未验证项不要写成 `PASS`
- 如果验收口径变了，应同步回写 `spec.md`

### 4.6 `doc/thread_bootstrap.md`

定位：

- 新线程的最小启动上下文

要求：

- 尽量短
- 尽量稳
- 可直接复制给 agent

### 4.7 `doc/pitfalls.md`

定位：

- 高价值、已验证的常见坑

要求：

- 只保留长期复用价值高的坑
- 硬红线优先移动到 `constraints.md`
- 不保留一次性讨论残留

### 4.8 `doc/threads/`

当前统一结构：

- `templates/`
- `active/`
- `closed/`

约束：

- 模板和实例不得混放
- 活跃线程必须放在 `active/`
- 已关闭但仍可能短期回看的线程放在 `closed/`
- 长期归档再移到 `doc/history/threads/`

### 4.9 `doc/adr/`

定位：

- 记录长期有效的结构性决策

要求：

- 一份 ADR 只记录一个决策
- 必须包含背景、决策、被放弃方案、影响
- 只有真正拍板的事项才进入 ADR

## 5. 更新规则

### 5.1 改设计时

优先更新：

- `doc/spec.md`

### 5.2 改红线时

优先更新：

- `doc/constraints.md`

### 5.3 改迁移路径时

优先更新：

- `doc/plan.md`

### 5.4 改 checkpoint 时

优先更新：

- `doc/status.md`
- `doc/threads/active/`

### 5.5 改验收口径或状态时

优先更新：

- `doc/acceptance.md`

### 5.6 改长期决策时

优先新增或更新：

- `doc/adr/`

## 6. 当前推荐结构

当前阶段建议保持如下结构：

- `spec.md`
- `constraints.md`
- `plan.md`
- `status.md`
- `acceptance.md`
- `thread_bootstrap.md`
- `writing_rules.md`
- `pitfalls.md`
- `threads/`
- `adr/`
- `history/`

Updated: 2026-04-03
