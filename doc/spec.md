# Browser Agent 设计规范

## 1. 文档定位

本文档只记录当前仍成立的设计真相、边界和不变量。

本文档不记录：

- 字段级接口复刻
- 某次迁移过程
- 已完成事项流水
- 日期补丁

代码可直接查到的协议细节，以代码为准：

- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/background/tools/registry.ts`
- `src/background/runtime-core.ts`

## 2. 核心定义

当前唯一核心定义：

`Agent = LLM + Tools + Memory + Runtime`

当前执行范式：

`LLM plan-driven tool orchestration`

含义：

- `LLM` 是决策核心。
- `Tools` 是稳定语义能力单元。
- `Memory` 是结构化工作记忆。
- `Runtime` 是最小执行保障层。

## 3. 顶层设计目标

系统设计优先满足：

- AI 易检索：相关逻辑、文档和边界能被快速找到。
- 系统易执行：路径稳定，副作用可见，验证与回滚容易。
- 路径清晰：输入、状态、流程和异常流向明确。
- 关键处可接管：人类无需看完全部，但必须能快速接管关键边界。

完整设计原则放在 `doc/reference/design_principles.md`，仅在架构取舍、模块拆分、抽象边界或文档系统调整时按需查阅。

## 4. 当前范围

当前主线任务模块：

- `direct_answer`
  - 面向简单稳定知识、已有充分证据后的追问、无需继续浏览器取证的问题。
- `commerce_search`
  - 面向京东站内商品搜索、提取、过滤和推荐输出。
- `public_research`
  - 面向多来源网页调研，当前代表 `multi_source_overview`。
- `site_overview`
  - 面向明确站点或官网入口的主页与一跳高价值页面概况。

当前不承诺：

- 执行中复杂改写 plan。
- 多站点通用 adapter。
- 下单、支付或其他高风险执行。
- 将 raw DOM 原子动作暴露给 LLM。
- 下载型附件、PDF、Word、Excel 主链读取。
- 精准字段确认型 research。

## 5. 组件边界

### 5.1 LLM

LLM 负责理解目标、生成静态初始 plan、判断任务模块、在多工具 step 中选 tool、对候选做受限取舍，并生成最终输出。

LLM 不负责 raw DOM 动作、selector、等待、滚动、tool 内恢复、绕过 `allowedTools` 或伪造事实来源。

### 5.2 Tools

Tools 负责执行稳定语义能力，封装脏活、等待、fallback 和局部恢复，并返回结构化结果。

Tools 不负责改写整个 plan、维护全局 workflow 脑子，或暴露原子 DOM 动作给 LLM 编排。

### 5.3 Memory

Memory 只保留结构化工作记忆：目标、任务类型、偏好、plan、step 状态、tool 历史、结构化事实、候选、来源、失败、unresolved issues 和最终结果。

Memory 不保留长网页原文、低价值页面噪音、代码可查接口细节、旧 phase 状态或重复摘要字段。

### 5.4 Runtime

Runtime 是最小保障层，负责 session 生命周期、静态 plan 启动、tool 执行宿主、预算、停止、恢复、状态广播、结果记录和最终兜底。

Runtime 不按 `phase` 或 `stepId` 硬编码业务语义，不为不同任务模块维护隐式 workflow，不代替 tool 做局部恢复。

## 6. 协议原则

字段级协议以代码为准，文档只记录不变量：

- Plan 是静态初始计划，执行中只更新 step 状态。
- 每个 step 必须限定可用工具范围。
- 内容脚本原子动作结果不等于 runtime-visible tool result。
- runtime-visible tool result 必须可合并到结构化 memory。
- 最终结果必须统一表达 `success / partial / failed / blocked`。
- 文档产物不是默认输出；只有用户明确要求文件、报告或 markdown 时才生成 artifact。

## 7. Runtime 不变量

当前 runtime 循环必须满足：

- 先有静态 plan，再执行 step。
- 单工具 step 不调用 LLM 选工具。
- 多工具 step 的 LLM 选择必须落在 `allowedTools` 内。
- tool 结果决定当前 step 的状态推进。
- 预算、重复失败、无进展必须能停止执行。
- 无论成功、失败、阻塞或用户停止，都必须形成结构化最终结果。

当前最小护栏包括总步数、软提醒、总耗时、同 tool 连续失败和连续无进展上限；具体数值以 `src/background/runtime-core.ts` 为准。

## 8. Task Module 边界

### 8.1 `direct_answer`

适用：

- 简单稳定知识。
- conversation 已有充分证据的追问。
- 无需继续打开浏览器的问题。

不适用：

- 明显依赖最新事实、当前时间、价格、新闻、法规或现势状态的问题。

### 8.2 `commerce_search`

适用：

- 京东站内商品搜索。
- 商品候选提取、过滤、比较和推荐。

当前不扩展为：

- 多电商通用 adapter。
- 下单、支付或库存承诺。

### 8.3 `public_research`

适用：

- 多来源网页调研。
- 需要 Google 搜索、来源筛选、逐页读取和汇总的问题。

当前边界：

- 只承诺概况型多来源调研。
- 不承诺精准字段抽取和完整事实核验。

### 8.4 `site_overview`

适用：

- 用户给出明确 URL。
- 用户明确要求查看某个官网、网站或站点。

当前边界：

- 可信入口主页。
- 主页一跳高价值页面。
- 输出粗粒度概况、来源列表和覆盖边界。

不允许伪装成：

- 完整站点画像。
- 深层 crawl。
- 精准字段确认。

## 9. UI 契约

Side Panel 只依赖当前 session 状态、timeline、最终结果和必要 artifacts。

UI 不应重新引入 `currentPhase`、旧 workflow 状态，或与 runtime 细节重复的结果正文。

`inline` 在会话流展示最终正文；`artifact` 展示短摘要和文档卡片；运行细节次于最终结果。

Updated: 2026-04-17
