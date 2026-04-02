# Browser Agent 设计规范

## 1. 文档定位

本文件定义当前线程的设计真相。

当前统一定义：

`Agent = LLM + Tools + Memory + Runtime`

目标不是让 LLM 直接处理细粒度 DOM 动作，而是把职责清晰拆开：

- `LLM` 负责任务理解、任务路由、搜索词生成、最终总结
- `Tools` 负责导航、等待、提取、过滤、读取页面、局部恢复
- `Memory` 负责保存高价值结构化上下文
- `Runtime` 负责 phase 循环、状态推进、校验、容错

## 2. 当前任务模型

### 2.1 任务类型

当前支持两类任务：

- `commerce_search`
  - 目标：围绕商品推荐、预算、比价等需求，完成搜索、提取、过滤与推荐
- `public_research`
  - 目标：围绕通用调研问题，完成搜索、来源筛选、来源页事实提取与总结

任务类型是 runtime 的第一层分流键。

### 2.2 任务路由

任务路由优先使用小模型：

- 输入：用户原始 goal
- 输出：`taskType + reason`
- 默认策略：
  - 小模型成功时使用小模型结果
  - 小模型失败时回退到规则路由

当前不提供显式模式切换 UI，仍保持单输入框自动路由。

### 2.3 固定任务模板

当前仍是固定模板，不做自由 planner。

`commerce_search`：

- `planning -> searching -> extracting -> filtering -> aggregating -> done`

`public_research`：

- `planning -> searching -> extracting -> filtering -> reading -> aggregating -> done`

当前已经有最小结构：

- `TaskPlan`
- `SubtaskSpec`
- `SubtaskResult`
- `FinalResult`

但这仍然是“带任务结构的 phase/tool-first MVP”，不是完整的自由子任务执行器。

## 3. LLM 职责

### 3.1 应由 LLM 负责的事

- 判断 `taskType`
- 生成稳定搜索词
- 在统一 aggregating 阶段生成最终 Markdown 输出

### 3.2 不应由 LLM 负责的事

- 细粒度 DOM 动作编排
- 页面 ready 判断
- selector fallback
- 提取失败后的局部重试
- 候选过滤规则

LLM 只应看到高价值结构化输入，而不是长 DOM、长日志和等待细节。

## 4. Tool 设计

### 4.1 当前高阶 Tool

当前主链高阶 Tool 为：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `readPageFacts`
- `aggregateTaskResults`

### 4.2 Tool 责任边界

Tool 内部应负责：

- 页面短等待
- 一次性恢复动作
- 提取逻辑
- 过滤规则
- 站点差异
- 局部失败降级

当前 runtime 不再让 LLM 直接调度底层 `click/type/scroll` 作为主流程。

## 5. 场景规范

### 5.1 commerce_search

当前规范：

- 入口站点固定京东
- 搜索词由小模型生成
- 搜索通过直达搜索结果 URL 实现，不依赖页面输入框交互
- 结构化提取商品卡片
- 过滤预算/去重/截断
- 统一进入 `aggregating`

### 5.2 public_research

当前规范：

- 搜索入口固定 Google
- 直接打开 Google 搜索结果 URL，不先进入主页输入
- 只看第一页搜索结果
- 过滤后保留前 5 个候选
- 候选过滤规则：
  - 去广告
  - 去重
  - 去 Google 内部页
  - 去明显 PDF
  - 只保留外部 `http(s)` 结果
- 按候选顺序串行读取来源页
- 读取成功或 partial 都记录
- 目标是得到 3 个来源结果，或候选耗尽

### 5.3 partial 规则

以下页面允许记为 `partial`，并在最终结果中显式暴露：

- PDF
- 登录墙 / 订阅墙
- 强交互 SPA
- 不可读页面

最终 research 输出必须包含：

- 结论摘要
- 来源要点
- 来源链接
- 未解决问题

## 6. Memory 设计

当前 memory 以单 session 结构化状态为主，已经显式包含：

- `taskType`
- `taskPlan`
- `subtaskResults`
- `researchCandidates`
- `researchSources`
- `unresolvedIssues`
- `activeSourceIndex`
- `finalResult`

当前还没有正式落地：

- 独立 `global memory + subtask memory`
- `chrome.storage.local` checkpoint
- 中断恢复

所以本轮仍按单任务内存态推进，不承诺恢复能力。

## 7. Runtime 设计

### 7.1 当前主循环

runtime 当前按 phase 选择高阶 Tool：

1. 识别 `taskType`
2. 生成 `TaskSpec + TaskPlan`
3. 进入 phase/tool loop
4. 收集结构化结果
5. 进入统一 `aggregating`
6. 生成最终输出并结束

### 7.2 统一 aggregating

`aggregating` 是独立阶段，不再把“最后一步总结”塞回前面的搜索/提取阶段。

统一约束：

- aggregating 只读结构化产物
- 不直接读取原始 DOM
- 最终输出统一落到 `FinalResult`
- 最终状态统一为：
  - `success`
  - `partial`
  - `failed`

### 7.3 receiver 缺失恢复

当 background 向 tab 发消息时，如果出现：

- `Could not establish connection. Receiving end does not exist.`

runtime 不再直接失败，而是回退到 direct bridge：

- 通过 `chrome.scripting.executeScript`
- 动态加载 `content-bridge.js`
- 直接调用 `scanCurrentPage / executeCurrentAction`

这个恢复是 runtime 级兜底，不要求 content script 消息通道一定先可用。

## 8. 容错原则

当前容错顺序：

1. Tool 内部局部恢复
2. phase 内一次短重试
3. 产出 `partial`
4. aggregating 显式暴露未解决问题

当前已显式识别的站点阻断包括：

- 京东搜索跳登录页
- Google 搜索进入 `sorry` 验证页

这类情况应当明确报错或汇总为 partial，而不是无限等待或继续盲扫。

## 9. 前端展示原则

side panel 保持统一壳子，不增加模式切换。

结果展示按 `taskType` 分流：

- `commerce_search`
  - 商品结果列表 + 最终总结
- `public_research`
  - 结论摘要 + 来源概览 + 来源链接 + 未解决问题

默认折叠：

- timeline
- task spec / filter diagnostics
- snapshot / debug
- logs
- 每个来源的详细内容

## 10. 当前阶段边界

本阶段明确不做：

- 自由 planner
- 并行子任务
- checkpoint / 恢复
- 多搜索引擎支持
- 多站点电商适配

本阶段优先回答：

- 这一步该由 `LLM` 做还是 `Tool` 做
- 这段上下文是否值得给 LLM
- 这一步是否必须进入 agent loop

Updated: 2026-04-02
