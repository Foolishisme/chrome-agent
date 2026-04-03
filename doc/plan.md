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

当前目标不是先把所有能力细拆完，而是先把系统迁移到：

`LLM plan-driven tool orchestration`

迁移要求：

- 保留现有两条已跑通链路作为回归基线
- 先让 `Runtime` 从 `phase -> tool` 硬编码调度迁移为 plan 执行器
- 先使用少量、语义稳定的粗颗粒 tool 承接旧能力
- 再根据真实复用与重试需求，逐步细化 tool 边界

## 3. 当前采用方案

当前采用的是“先切范式，再收敛工具边界；先跑通闭环，再逐步细拆”的路径。

核心策略：

1. 先固定协议层
2. 再把 `Runtime` 迁移到 plan 驱动执行
3. 用少量粗颗粒 tool 跑通 `commerce_search / public_research`
4. 闭环稳定后，再按复用价值细拆 tool
5. 最后验证文档/文件类试点

说明：

- 当前不要求第一步就把“读取来源页”和“提取事实”拆成两个 tool
- 当前不要求把所有旧工具原样搬到新范式
- 当前优先消除“按旧 phase 命名和调度”的工具边界

## 4. 工作分解

### 4.1 协议层

目标：

- 定义 `PlanStep`
- 定义新的 `ToolResult`
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
- `LLM` 只能在当前 step 的 `allowedTools` 中选下一步 tool

### 4.3 过渡 Tool 层

目标：

- 先把旧能力收敛成少量粗颗粒、语义稳定的 tool
- 不再让 tool 名称直接绑定旧 `phase`
- 保留 tool 内部局部恢复，不把原子 DOM 动作暴露给 `LLM`

第一批过渡 tool 建议为：

- `compileTaskSpec`
- `openSearchResults`
- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`
- `finalizeCommerceResult`
- `finalizeResearchResult`

说明：

- `readResearchSourceFacts` 当前保持为一个大 tool，内部负责“打开来源页 + 提取事实 + 局部 fallback”
- 当前不为拆分而拆分，不把“读取来源页”和“提取事实”强行拆成两个 tool
- 细拆应发生在新范式闭环稳定之后

### 4.4 任务模块层

目标：

- 先迁移 `commerce_search`
- 再迁移 `public_research`
- 验证旧回归基线仍成立

说明：

- `commerce_search` 先用 `compileTaskSpec -> openSearchResults -> collectCommerceCandidates -> finalizeCommerceResult`
- `public_research` 先用 `compileTaskSpec -> openSearchResults -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult`
- `readResearchSourceFacts` 可在 plan 中多次出现，不要求 tool 自己演化成复杂工作流引擎

### 4.5 细化 Tool 层

目标：

- 在新循环稳定后，再根据复用价值和失败模式细拆 tool

优先考虑的后续细化点：

- 将 `collectCommerceCandidates` 细化为“提取”与“过滤”
- 将 `collectResearchCandidates` 细化为“提取”与“过滤”
- 评估 `compileTaskSpec` 与 `openSearchResults` 是否需要按模块分化

不优先细化的点：

- “读取来源页”和“提取事实”当前不优先拆分
- 不把页面等待、scroll recovery、selector fallback 暴露给 `LLM`

### 4.6 试点扩展层

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
3. 过渡 Tool 层
4. `commerce_search` 迁移
5. `public_research` 迁移

可有限并行：

- 输出 schema 与 side panel 展示适配
- 文件/文档类 tool 设计讨论
- 迁移完成后的 tool 细拆方案讨论

## 6. 当前明确不做

当前不做：

- 执行中复杂 plan 改写
- 浏览器原子动作全面开放给 `LLM`
- 一开始就把所有能力细拆到底
- 为了形式整齐而把“读取来源页”和“提取事实”强行拆开
- 一开始就并行推进多个全新任务模块
- 为了通用而先做大而全抽象

## 7. 当前阶段完成标准

当前这轮迁移至少应完成：

1. `PlanStep` 与新的 `ToolResult` 契约落地
2. Runtime 最小护栏落地
3. 基于少量粗颗粒 tool 跑通 `commerce_search`
4. 基于少量粗颗粒 tool 跑通 `public_research`
5. 最终输出在 `success / partial / failed / blocked` 四种状态下都可见

## 8. 与其他文档的关系

- [spec.md](D:/code/browser-agent-mvp/doc/spec.md)：定义应该是什么
- [constraints.md](D:/code/browser-agent-mvp/doc/constraints.md)：定义绝对不能怎么做
- [status.md](D:/code/browser-agent-mvp/doc/status.md)：记录当前 checkpoint
- [acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md)：记录如何算通过

Updated: 2026-04-03
