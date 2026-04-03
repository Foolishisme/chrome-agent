# Browser Agent 当前迁移路径

## 1. 文档定位

本文件只记录当前采用的迁移方案与执行路径。

它回答：

- 当前准备怎么做
- 先做什么，后做什么
- 哪些工作可以并行，哪些必须串行
- 当前明确不做什么

它不记录：

- 设计真相
- 绝对红线
- 当日进度

## 2. 当前目标

当前目标不是继续补固定 workflow，而是把系统迁移到：

`LLM plan-driven tool orchestration`

迁移要求：

- 保留现有两条已跑通链路作为回归基线
- 用静态初始 plan 驱动执行
- 用统一 `ToolResult` 驱动下一步判断
- 让 `Runtime` 退回到最小护栏层

## 3. 当前采用方案

当前采用的是“先协议，后执行；先迁移旧链路，再加新能力”的路径。

核心策略：

1. 先固定协议层
2. 再迁移 runtime 执行循环
3. 再迁移现有 tools
4. 再迁移两条旧链路
5. 最后验证文档/文件类试点

## 4. 工作分解

### 4.1 协议层

目标：

- 定义 `PlanStep`
- 定义 `ToolResult`
- 定义新的 memory 关键字段
- 固定最终输出 schema

产出：

- `src/shared/types.ts` 中的协议类型
- 与 [acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md) 对齐的新迁移验收项

### 4.2 Runtime 层

目标：

- 从 `phase -> tool` 调度迁移到 plan 执行器
- 固定最小护栏
- 记录 step 状态、tool result、预算状态

产出：

- 新的最小执行循环
- `budget_low`、硬停止、无进展停止

### 4.3 Tool 层

目标：

- 让现有 tool 返回统一结构化结果
- 去掉直接推进全局 phase 的做法
- 保留 tool 内部局部恢复

产出：

- 迁移后的 `compileTask / searchInSite / extractStructuredResults / filterCandidates / readPageFacts / aggregateTaskResults`

### 4.4 任务模块层

目标：

- 先迁移 `commerce_search`
- 再迁移 `public_research`
- 验证旧回归基线仍成立

### 4.5 试点扩展层

目标：

- 在新循环稳定后，再验证一个文件/文档类试点

建议试点：

- 下载资料
- PDF 转文本
- 文档类汇总

## 5. 串并行关系

必须串行：

1. 协议层
2. Runtime 层
3. Tool 层
4. `commerce_search` 迁移
5. `public_research` 迁移

可有限并行：

- 输出 schema 与 side panel 展示适配
- 文件/文档类 tool 设计讨论
- 验收项细化

## 6. 当前明确不做

当前不做：

- 执行中复杂 plan 改写
- 浏览器原子动作全面开放给 LLM
- 一开始就支持开放世界浏览
- 一开始就并行推进多个全新任务模块
- 为了通用而先做大而全抽象

## 7. 当前阶段完成标准

当前这轮迁移至少应完成：

1. `PlanStep` 与 `ToolResult` 契约落地
2. Runtime 最小护栏落地
3. `commerce_search` 跑通新循环
4. `public_research` 跑通新循环
5. 最终输出在 `success / partial / failed / blocked` 四种状态下都可见

## 8. 与其他文档的关系

- [spec.md](D:/code/browser-agent-mvp/doc/spec.md)：定义应该是什么
- [constraints.md](D:/code/browser-agent-mvp/doc/constraints.md)：定义绝对不能怎么做
- [status.md](D:/code/browser-agent-mvp/doc/status.md)：记录当前 checkpoint
- [acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md)：记录如何算通过

Updated: 2026-04-03
