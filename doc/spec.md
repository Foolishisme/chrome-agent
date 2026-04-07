# Browser Agent 设计规范

## 1. 文档定位

本文档只回答一件事：当前主线下，系统应该是什么。

它定义：

- 核心抽象
- 执行范式
- 组件边界
- 当前任务范围
- 统一协议

它不记录：

- 某次改动细节
- 临时调参过程
- 当日进度

## 2. 核心定义

唯一核心定义仍然是：

`Agent = LLM + Tools + Memory + Runtime`

当前执行范式是：

`LLM plan-driven tool orchestration`

当前 v1 约束：

- 先生成静态初始 `PlanStep[]`
- 执行过程中只更新 step 状态，不支持执行中复杂改 plan
- 单工具 step 由 runtime 直接执行
- 多工具 step 才调用 LLM 选择 tool

## 3. 当前范围

当前已跑通的任务模块：

- `commerce_search`
  - 京东站内商品搜索、提取、过滤和推荐输出
- `public_research`
  - Google 搜索、来源筛选、逐页读取和调研汇总

当前不应假设：

- 已支持执行中动态改写 plan
- 已支持多站点通用 adapter
- 已支持下单、支付或其他高风险执行
- 已支持把 raw DOM 原子动作直接暴露给 LLM
- 已支持文件 / PDF artifact 主链

## 4. 组件边界

### 4.1 LLM

LLM 负责：

- 理解用户目标
- 生成静态初始 plan
- 在多工具 step 内选择下一步 tool
- 生成最终输出

LLM 不负责：

- raw DOM 动作
- selector 和等待细节
- tool 内局部恢复
- 绕过 `allowedTools`
- 伪造 tool 结果

### 4.2 Tools

Tools 是 runtime-visible 的稳定语义能力单元。

Tools 负责：

- 执行一个清晰能力边界内的工作
- 封装局部恢复、滚动、重开、fallback
- 返回统一高层 `ToolResult`

Tools 不负责：

- 改写整个 plan
- 维护全局 workflow 脑子
- 把原子 DOM 动作暴露给 LLM 编排

### 4.3 Memory

Memory 只保留结构化工作记忆。

当前主链保留：

- `goal`
- `taskType`
- `plan`
- `taskSpec`
- `toolHistory`
- `currentFacts`
- `stepHistory`
- `extractedItems`
- `researchCandidates`
- `researchSources`
- `failures`
- `unresolvedIssues`
- `finalResult`

当前主链不再保留：

- `currentPhase`
- `taskPlan`
- `subtaskResults`
- `finalSummary`
- `finalOutput`

### 4.4 Runtime

Runtime 是最小保障层，不是业务主脑。

Runtime 负责：

- session 生命周期
- 静态 plan 启动
- 单工具直跑 / 多工具选 tool
- tool 执行宿主
- 预算、停止、恢复、状态广播
- 记录 `ToolResult`
- 统一最终输出兜底

Runtime 不负责：

- 按 `stepId` 或 `phase` 硬编码业务语义
- 为不同任务模块维护一套隐式 workflow
- 代替 tool 处理局部恢复

## 5. Canonical Tool 集合

当前只保留一套 canonical tool：

- `compileTaskSpec`
- `openSearchResults`
- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`
- `finalizeCommerceResult`
- `finalizeResearchResult`

旧别名已退出主链：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `readPageFacts`
- `aggregateTaskResults`

## 6. 统一协议

### 6.1 PlanStep

每个 step 至少包含：

- `stepId`
- `goal`
- `allowedTools`
- `successCriteria`
- `status`

`status` 固定为：

- `pending`
- `running`
- `succeeded`
- `failed`
- `blocked`

### 6.2 ActionResult

`ActionResult` 只用于内容脚本原子动作回包，如：

- `NAVIGATE`
- `SCROLL`
- `EXTRACT_LIST`
- `EXTRACT_SEARCH_RESULTS`
- `EXTRACT_PAGE_FACTS`

它不是 runtime-visible 的高层 tool 契约。

### 6.3 ToolResult

每个 runtime-visible tool 返回统一高层 `ToolResult`：

- `status`: `success | partial | retryable_error | fatal_error`
- `summary`
- `outputs`
- `artifacts`
- `facts`
- `stepStatus`
- `errorCode?`
- `retryHint?`
- `terminal?`

当前 `artifacts` 字段已固定，但默认仍为空数组。

### 6.4 FinalResult

最终输出统一为：

- `status`: `success | partial | failed | blocked`
- `summary`
- `markdown`
- `keyResults`
- `completedSteps`
- `remainingOrFailedSteps`
- `errorsOrBlockers`
- `artifacts`
- `suggestedNextAction`

## 7. Runtime 循环

当前 runtime 循环固定为：

1. 创建 session
2. 路由任务类型
3. 生成静态初始 `PlanStep[]`
4. 读取当前 `running` 或首个 `pending` step
5. 若 `allowedTools.length === 1`，直接执行该 tool
6. 若 `allowedTools.length > 1`，调用 LLM 选 tool，并校验结果必须属于 `allowedTools`
7. 执行 tool，合并 `facts`、记录 `ToolResult`
8. 按 `ToolResult.stepStatus` 更新当前 step
9. 命中终止条件时输出统一 `FinalResult`

当前 runtime 顶层状态固定为：

- `idle`
- `running`
- `done`
- `error`

## 8. 当前模块主链

### 8.1 commerce_search

固定序列：

`compileTaskSpec -> openSearchResults -> collectCommerceCandidates -> finalizeCommerceResult`

其中：

- `collectCommerceCandidates` 内部处理提取、过滤和必要 scroll recovery

### 8.2 public_research

固定序列：

`compileTaskSpec -> openSearchResults -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult`

其中：

- `collectResearchCandidates` 内部处理提取和过滤
- `readResearchSourceFacts` 允许同一 step 重复执行，直到达到来源目标或候选耗尽

## 9. 最小护栏

当前 runtime 护栏固定为：

- `maxTotalSteps = 20`
- `softStepLimit = 15`
- `maxElapsedMs = 180000`
- `maxSameToolRetries = 3`
- `maxConsecutiveNoProgress = 3`

其中“无进展”至少指以下之一未发生变化：

- 新增或更新 `facts`
- 新增 `artifacts`
- 结构化结果数量增加
- 新增已完成 step
- 生成 `finalResult`

## 10. UI 契约

Side Panel 当前只读取：

- runtime 顶层状态：`idle | running | done | error`
- 当前 step / 当前 tool / elapsed / budget
- `finalResult.markdown`
- `finalResult.status`
- `finalResult.errorsOrBlockers`
- `finalResult.suggestedNextAction`

UI 不再展示 `currentPhase`。

Updated: 2026-04-07
