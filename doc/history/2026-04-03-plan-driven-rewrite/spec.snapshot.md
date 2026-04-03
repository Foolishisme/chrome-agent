# Browser Agent 设计规范

## 1. 文档定位

本文档只回答一件事：当前主线下，系统应该是什么。

它定义：

- 核心抽象
- 组件边界
- 当前任务范围
- 明确的 MUST / MUST NOT

它不记录：

- 某次改动细节
- 临时调参过程
- 真机验收结果

## 2. 核心定义

唯一核心定义：

`Agent = LLM + Tools + Memory + Runtime`

这是当前项目的设计真相。

## 3. 当前设计范围

### 3.1 支持的任务类型

当前主线支持两类任务：

- `commerce_search`
  - 目标：在京东站内完成商品搜索、提取、过滤和推荐输出
- `public_research`
  - 目标：在 Google 上完成公网搜索、来源筛选、逐页读取和调研汇总

### 3.2 当前非目标

当前设计不要求：

- 多站点通用 adapter
- LLM 自由选择任意下一步原子动作
- 自动购买、支付或其他高风险执行
- 复杂开放世界浏览器操作

## 4. 组件边界

### 4.1 LLM

`LLM` 必须负责：

- 理解用户目标
- 判断任务类型
- 生成查询词
- 基于结构化结果生成最终输出

`LLM` 必须不负责：

- 细粒度 DOM 操作
- 页面等待与重试
- 结构化提取
- 基础去重与基础过滤
- 低层页面恢复逻辑

### 4.2 Tools

`Tools` 必须负责：

- 打开目标搜索页
- 执行页面动作
- 提取结构化候选
- 过滤候选
- 读取来源页事实
- 在不改变当前 tool 对外契约的前提下执行内部重试、fallback 和 provider fallback
- 校验结果是否满足当前 tool 的最低可用标准
- 局部恢复与失败返回

`Tools` 必须不负责：

- 改写系统设计边界
- 在工具内部偷偷引入新的任务类型判断
- 基于任务目标判断结果“够不够好”
- 在 tool 已返回后决定下一步 phase、下一步策略或任务是否结束

### 4.3 Memory

`Memory` 必须只保留高价值结构化状态。

至少应包含：

- `goal`
- `taskType`
- `taskSpec`
- `currentPhase`
- `toolHistory`
- `extractedItems`
- `researchCandidates`
- `researchSources`
- `failures`
- `finalOutput`

`Memory` 必须不保留：

- 大段原始 DOM
- 大量原始日志
- 对当前循环无帮助的历史噪音

### 4.4 Runtime

`Runtime` 必须负责：

- session 生命周期
- phase 驱动的确定性循环
- tool 调度
- tool 结果校验
- 判断 tool 返回结果对当前任务是否足够可用
- 决定结果不足时的下一步调度、重跑、降级、终止或 partial
- 状态广播
- 超时、停止和恢复控制

`Runtime` 必须不负责：

- 业务语义推理
- 页面提取规则
- 候选过滤细则
- 替代 tool 做 tool 契约内的局部恢复

### 4.5 Tools 与 Runtime 的边界判定

判断规则：

- 同一 tool 为完成自己既定契约而进行的重试、fallback、provider 切换，属于 `Tools`
- tool 结果已返回后，结果是否足以支撑当前任务继续推进，属于 `Runtime`
- `Tools` 负责“结果是否成立、是否达到 tool 的最低可用标准”
- `Runtime` 负责“结果是否足以完成当前任务目标，以及下一步怎么办”

例如：

- 搜索页等待、selector fallback、bridge fallback，属于 `Tools`
- provider A 失败后切 provider B，只要仍在完成同一个 tool 契约，属于 `Tools`
- tool 返回候选后判断是否足以进入下一 phase，属于 `Runtime`
- tool 返回成功但结果与用户目标明显不符，是否重跑、改策略或结束失败，属于 `Runtime`

## 5. 工具与 phase 契约

### 5.1 当前标准高阶工具

当前标准工具集合为：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `readPageFacts`
- `aggregateTaskResults`

### 5.2 phase 必须是确定性的

当前主线采用 phase-driven loop，而不是开放式 planner。

`commerce_search` 的推荐 phase 顺序：

1. `planning`
2. `searching`
3. `extracting`
4. `filtering`
5. `aggregating`
6. `done`

`public_research` 的推荐 phase 顺序：

1. `planning`
2. `searching`
3. `extracting`
4. `filtering`
5. `reading`
6. `aggregating`
7. `done`

## 6. 任务类型契约

### 6.1 `commerce_search`

必须满足：

- 搜索入口是京东
- 查询词由 lite model 生成
- 商品候选由代码侧提取
- 去重和基础过滤由代码侧完成
- 最终推荐结果由 LLM 汇总输出

### 6.2 `public_research`

必须满足：

- 搜索入口是 Google
- 查询词由 lite model 生成
- 候选来源从 Google 第一页自然结果中提取
- 来源页事实由代码侧提取
- 最终调研结果由 LLM 汇总输出

## 7. 输出契约

系统最终输出必须是结构化可展示结果，而不是仅有内部日志。

对于 `commerce_search`：

- 输出推荐 Markdown
- 包含商品链接和基本说明

对于 `public_research`：

- 输出调研摘要
- 包含来源概览
- 包含未解决问题

## 8. 当前设计约束

当前阶段必须坚持：

- 先把高阶 tool 主线跑稳，再谈更开放的 planner
- 先把真机验收补齐，再谈更泛化的站点扩展
- 先保持文档职责单一，再考虑继续拆分专题文档

Updated: 2026-04-03
