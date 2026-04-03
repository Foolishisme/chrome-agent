# Browser Agent 设计规范

## 1. 文档定位

本文档只回答一件事：当前主线下，系统应该是什么。

它定义：

- 核心抽象
- 执行范式
- 组件边界
- 当前任务范围
- 明确的 MUST / MUST NOT

它不记录：

- 某次改动细节
- 临时调参过程
- 真机验收结果

## 2. 核心定义

唯一核心定义仍是：

`Agent = LLM + Tools + Memory + Runtime`

但当前执行范式已经切换为：

`LLM plan-driven tool orchestration`

当前 v1 约束：

- 先生成一份静态初始 plan
- 执行过程中允许更新 step 状态
- 暂不支持执行中复杂 plan 改写、插步、删步和大规模重排

## 3. 当前设计范围

### 3.1 当前已落地的任务模块

当前代码已经跑通的模块仍是：

- `commerce_search`
  - 目标：京东商品搜索、提取、过滤和推荐输出
- `public_research`
  - 目标：Google 搜索、来源筛选、逐页读取和调研汇总

### 3.2 下一步设计目标

当前升级目标不是继续堆固定 workflow，而是让系统可以：

- 用可复用 tools 组合出新任务模块
- 允许文件/文档类能力进入主链
- 让 LLM 基于 plan 和 tool result 决定下一步

例如后续可支持：

- 报告收集
- 文件下载
- PDF 转文本
- 多来源资料汇总

### 3.3 当前非目标

当前设计仍不要求：

- 让 LLM 直接决定 raw DOM 动作、selector、等待细节
- 执行中任意改写 plan 结构
- 复杂开放世界浏览器操作
- 自动购买、支付或其他高风险执行
- 一开始就做完美通用框架

## 4. 组件边界

### 4.1 LLM

`LLM` 必须负责：

- 理解用户目标
- 生成静态初始 plan
- 基于当前 plan、memory 和 tool result 选择下一步
- 判断当前 step 是继续、重试、完成还是终止
- 更新 step 状态与任务级结论
- 生成最终输出

`LLM` 必须不负责：

- raw DOM 动作
- selector 选择与等待细节
- tool 内部本地恢复
- 绕过 `allowedTools` 随意调用未授权能力
- 伪造 tool 结果
- 绕过 runtime 的超时、预算和停止条件

### 4.2 Tools

`Tools` 是 runtime 可见的可复用能力单元。

`Tools` 必须负责：

- 完成自己声明的能力契约
- 封装执行细节、脏活和局部恢复
- 在 tool 内部处理短重试、fallback、provider fallback
- 返回结构化执行结果，而不是只返回散乱日志
- 暴露足够稳定、可组合的能力边界

`Tools` 必须不负责：

- 自己决定任务是否完成
- 擅自改写整个 plan
- 绕过 runtime 直接推进全局状态机
- 把 task-level 策略判断偷偷塞回 tool 内部

### 4.3 Tool 的颗粒度

当前必须明确区分两层：

1. `runtime-visible tool`
2. `tool-internal steps`

`runtime-visible tool` 应满足：

- 语义稳定
- 可独立观察
- 值得单独重试
- 值得单独验收
- 对多个任务模块可复用

`tool-internal steps` 留在 tool 内部处理，例如：

- 等待页面可用
- selector fallback
- provider fallback
- 下载后的文件类型识别
- PDF parser fallback
- 临时文件清理

当前默认不把以下内容直接暴露给 LLM：

- `click`
- `wait`
- `selector`
- 其他纯原子 DOM 动作

但文件/文档类能力如果语义稳定，可以直接成为 `runtime-visible tool`，例如：

- `downloadArtifact`
- `extractPdfText`

### 4.4 Memory

`Memory` 必须只保留高价值结构化状态。

至少应包含：

- `goal`
- `taskModule`
- `plan`
- `stepStatuses`
- `currentStepId`
- `toolCallHistory`
- `artifacts`
- `extractedFacts`
- `failures`
- `finalOutput`

`Memory` 必须不保留：

- 大段原始 DOM
- 大量原始日志
- 无结构页面噪音
- 对当前执行无帮助的历史垃圾

### 4.5 Runtime

`Runtime` 是护栏层和执行宿主，不再是按任务硬编码 workflow 的主脑。

`Runtime` 必须负责：

- session 生命周期
- 状态持久化与恢复
- 调用 LLM 生成 plan
- 调用 LLM 基于结果选择下一步
- 执行被选中的 tool
- 记录 tool 调用结果
- 预算、超时、停止与恢复控制
- 状态广播

`Runtime` 必须不负责：

- 为每个任务模块硬编码固定 phase 顺序
- 代替 LLM 做任务级语义判断
- 代替 tool 做局部恢复
- 把自己膨胀成复杂 workflow 引擎

### 4.6 Runtime 最小护栏

当前阶段，`Runtime` 先只承担最小必要护栏：

- `maxTotalSteps = 20`
- `softStepLimit = 15`
- `maxElapsedMs = 180000`
- `maxSameToolRetries = 3`
- `maxConsecutiveNoProgress = 3`

语义约束：

- 到达 `softStepLimit` 后，runtime 必须向 LLM 暴露 `budget_low`
- 收到 `budget_low` 后，LLM 必须优先收敛，尽快完成、输出 `partial`，或明确失败
- 到达 `maxTotalSteps` 后，runtime 必须强制停止
- 超过 `maxElapsedMs` 后，runtime 必须强制停止
- 同一 tool 连续失败达到 `maxSameToolRetries` 后，runtime 不再继续盲试该 tool
- 连续 `maxConsecutiveNoProgress` 步没有新增事实、artifact 或 step 进展时，runtime 必须停止并返回无进展失败

这里的“无进展”至少指以下之一长期没有变化：

- 新增 `facts`
- 新增 `artifacts`
- 新增已完成 step
- 明确缩小未解决范围

### 4.7 Task Module

`task module` 仍然保留，但它不再等于固定 workflow。

`task module` 当前只用于提供：

- 默认 prompt 上下文
- 默认可用 tools 范围
- 输出 schema
- 验收与展示约束

它必须不负责：

- 绑定一条写死的 phase 顺序
- 把新增能力强制改造成新的固定状态机

## 5. Plan 与 Tool 契约

### 5.1 初始 Plan 契约

v1 的 plan 是静态初始 plan。

每个 step 至少应包含：

- `stepId`
- `goal`
- `allowedTools`
- `successCriteria`
- `status`

`status` 至少应支持：

- `pending`
- `running`
- `succeeded`
- `failed`
- `blocked`

### 5.2 Tool Result 契约

每个 tool 至少应返回：

- `status`
- `summary`
- `outputs`
- `artifacts`
- `facts`
- `errorCode`
- `retryHint`

其中 `status` 至少应覆盖：

- `success`
- `partial`
- `retryable_error`
- `fatal_error`

### 5.3 Runtime 执行循环

当前目标循环应是：

1. 创建或恢复 session
2. 若没有 plan，则调用 LLM 生成静态初始 plan
3. 读取当前未完成 step
4. 让 LLM 在 `allowedTools` 中选择下一步 tool
5. 由 runtime 执行该 tool
6. 将 tool result 写入 memory
7. 由 LLM 更新 step 状态并决定继续、重试、终止或完成
8. 直到任务完成、被阻塞、被停止或预算耗尽

### 5.4 当前工具组合原则

当前阶段优先做：

- 先把一个个 tool 封装可用
- 再让 LLM 通过 plan 组合这些 tools
- 先覆盖 70% 常见场景
- 剩余失败路径再逐步修复

当前阶段不做：

- 一开始就支持复杂 plan 自我改写
- 一开始就把所有浏览器原子动作暴露给 LLM
- 一开始就追求完美通用抽象

## 6. 输出契约

系统最终输出必须是结构化可展示结果，而不是仅有内部日志。

### 6.1 顶层输出状态

无论成功或失败，系统最终都必须返回以下之一：

- `success`
- `partial`
- `failed`
- `blocked`

状态语义：

- `success`：目标已完成，关键结果已得到
- `partial`：得到部分结果，但未完整完成目标
- `failed`：系统已尝试，但未完成目标
- `blocked`：外部前提不满足，系统无法继续推进

### 6.2 最终输出结构

最终输出至少应包含：

- `status`
- `summary`
- `keyResults`
- `completedSteps`
- `remainingOrFailedSteps`
- `errorsOrBlockers`
- `artifacts`
- `suggestedNextAction`

约束：

- 即使最终是 `failed` 或 `blocked`，也必须返回结构化输出
- 不允许只返回原始日志或一句失败提示
- `suggestedNextAction` 应尽量给出下一步可执行建议

### 6.3 当前模块的最低输出要求

当前模块至少保持：

- `commerce_search`
  - 输出推荐 Markdown
  - 包含商品链接和基本说明
- `public_research`
  - 输出调研摘要
  - 包含来源概览
  - 包含未解决问题

后续新模块的输出 schema 应由 `task module` 单独约束。

## 7. 当前设计约束

当前阶段必须坚持：

- 先把静态 plan + tool orchestration 跑稳，再谈更复杂 planner
- 先让 runtime 做护栏层，不把它重新做复杂 workflow 引擎
- 先保持 tool 语义稳定，再决定是否继续细拆
- 先把现有两条已跑通链路迁移到新范式，再加更多新模块
- 先把最小护栏和最终输出契约固定，再逐步补更多恢复策略

Updated: 2026-04-03
