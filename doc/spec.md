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

- `direct_answer`
  - 面向简单稳定知识问答、已搜索且证据充足后的追问，以及无需再开浏览器的直接回答
- `commerce_search`
  - 京东站内商品搜索、提取、过滤和推荐输出
- `public_research`
  - Google 搜索、第一页来源筛选与重排序、逐页读取和调研汇总

当前已拍板的更大任务家族方向：

- `direct_answer`
  - 非浏览器证据获取分支，面向无需继续开浏览器的直接回答
- `browser_research`
  - 广义网页调研家族，面向浏览器中的证据获取、页面读取与结果交付
  - 当前已实现代表分支仍是 `public_research`
  - 下一阶段优先收口两个概况型 mode：
    - `site_overview`
    - `multi_source_overview`
  - `site_precise / multi_source_precise` 暂不进入主线
- `commerce_search`
  - 当前仍保留为独立垂直任务模块，不立即并入 `browser_research`

当前不应假设：

- 已支持执行中动态改写 plan
- 已支持多站点通用 adapter
- 已支持下单、支付或其他高风险执行
- 已支持把 raw DOM 原子动作直接暴露给 LLM
- 已支持完整文件系统导出或 PDF artifact 主链

## 4. 组件边界

### 4.1 LLM

LLM 负责：

- 理解用户目标
- 生成静态初始 plan
- 在 `compileTaskSpec` 阶段一次性判断当前目标应进入 `direct_answer / commerce_search / 当前或未来的 browser_research mode`
- “是否需要调研”和“进入哪种调研 mode”在同一次路由内完成，不拆成两次独立大判断
- 在多工具 step 内选择下一步 tool
- 生成最终输出
- 对第一页 research 候选做轻量重排序

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
- 在 research 任务内封装候选发现、站内跟进、附件读取、下载和解析等脏活
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
- `searchPreference`
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
- `finalizeDirectAnswer`
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
仅当用户明确要求“文档 / 报告 / markdown / 文件”时，最终结果才会附带 markdown artifact。

### 6.4 FinalResult

最终输出统一为：

- `outputMode`: `inline | artifact`
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

### 8.1 direct_answer

固定序列：

`compileTaskSpec -> finalizeDirectAnswer`

其中：

- `compileTaskSpec` 负责判断当前问题是否可直接回答
- 直接回答适用于简单稳定知识、当前 conversation 已有充分证据，或已完成搜索后的证据内追问
- 若问题明显依赖最新外部事实、当前时间或现势状态，则不走 `direct_answer`

### 8.2 commerce_search

固定序列：

`compileTaskSpec -> openSearchResults -> collectCommerceCandidates -> finalizeCommerceResult`

其中：

- `collectCommerceCandidates` 内部处理提取、过滤和必要 scroll recovery

### 8.3 public_research

固定序列：

`compileTaskSpec -> openSearchResults -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult`

其中：

- `collectResearchCandidates` 内部处理第一页提取、过滤和轻量重排序
- `readResearchSourceFacts` 允许同一 step 重复执行，直到达到来源目标或候选耗尽

### 8.4 browser_research（设计方向）

广义网页调研的统一最小骨架为：

`compileTaskSpec -> acquireCandidates -> readSourceFacts -> validateOrAggregate -> finalizeResult`

其中：

- `site_overview`
  - 面向单站点概况型调研
  - 最小目标是读取主页及前 `N` 个高价值页面，输出带覆盖边界的粗粒度概况
- `multi_source_overview`
  - 面向多站点概况型调研
  - 当前由 `public_research` 作为已实现代表分支承接
- `site_precise / multi_source_precise`
  - 面向精确信息确认与字段提取
  - 当前只作为后续方向，不进入主线承诺

当前收口原则：

- 不因为通用调研方向而立即新增一批 runtime-visible tool 名称
- 当前优先复用 `collectResearchCandidates / readResearchSourceFacts / finalizeResearchResult`
- 站内多级跳转、附件跟进、文档下载与解析优先放在 tool 内部，不暴露成 plan-visible 原子动作
- 站点型 mode 允许在候选发现前插入一个可复用的 `resolveEntryPoint` step，用于显式 URL 直达与有限入口修复

#### 8.4.1 `site_overview` MVP

`site_overview` 的最小目标不是“完整理解整个站点”，而是：

- 从一个明确站点入口开始
- 读取主页与前 `N` 个高价值页面
- 输出带来源和覆盖边界的粗粒度站点概况

最小 `TaskSpec` 应至少包含：

- `taskType = browser_research`
- `researchMode = site_overview`
- `entryMode = explicit_url | resolve_official_home`
- `entryUrl?`
- `siteName?`
- `targetDomain`
- `pageReadLimit`
- `candidateLimit`
- `maxLinkDepth = 1`
- `outputIntent = overview`

当前默认约束：

- `pageReadLimit` 默认控制在 `3-5`
- `candidateLimit` 只覆盖主页直达的一跳候选
- 只读站内 `http/https` 页面
- 用户显式提供 `URL` 时优先直达，不先走搜索
- 显式 `URL` 失效时只允许一次有界入口修复，例如回退站点根路径或解析官网主页
- 未提供 `URL` 时才解析官网入口，目标是拿到一个可信主入口，不是先搜内容页
- 当前不承诺 PDF / Word / Excel / 下载型资料进入主链

最小 `PlanStep` 模板为：

1. `compileTaskSpec`
2. `resolveEntryPoint`
3. `acquireCandidates`
4. `readSourceFacts`
5. `validateOrAggregate`
6. `finalizeResult`

各步完成标准：

1. `compileTaskSpec`
   - 已确认当前目标属于 `site_overview`
   - 已拿到入口模式、域名范围、页数预算和输出意图
2. `resolveEntryPoint`
   - 若用户提供显式 `URL`，已完成直达与站点校验
   - 若显式 `URL` 无效，已在一次有界修复内尝试根路径或官网主页解析
   - 若用户未提供 `URL`，已定位到可信官网主入口
3. `acquireCandidates`
   - 已读取主页
   - 已从主页直达链接中筛出前 `N` 个高价值页面候选
4. `readSourceFacts`
   - 已读取主页与若干候选页面正文
   - 达到 `pageReadLimit` 或候选耗尽即结束
5. `validateOrAggregate`
   - 已形成可用于最终输出的主题摘要、来源列表和覆盖边界
6. `finalizeResult`
   - 已输出站点概况
   - 已明确标出读取范围、未覆盖区域与不确定性

`site_overview` 的最小停止条件：

- `success`
  - 已成功读取主页，且至少读取 `2` 个高价值页面，能够产出带来源的概况
- `partial`
  - 主页可读，但高价值页面不足、部分页面不可读，或入口修复后只拿到有限内容，仍可产出有限概况
- `blocked`
  - 站点入口被登录、验证码、权限墙或非网页资源阻断，无法进入最小读取范围
- `failed`
  - 入口无效且一次有界修复后仍失败、同域候选为空，或在页数预算内没有拿到任何可读正文

当前不允许把以下情况伪装成 `success`：

- 只读了主页就输出“完整站点画像”
- 只读到了导航标题，没有拿到正文
- 只拿到一组原始 URL，没有结合标题/区域信号筛过高价值页面
- 页面明显被登录墙、验证码或下载型入口阻断

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
- `searchPreference`
- 当前 step / 当前 tool / elapsed / budget
- 运行细节：goal / 当前进展 / timeline / logs / source detail
- `finalResult.outputMode`
- `finalResult.markdown`
- `finalResult.summary`
- `finalResult.artifacts`

UI 不再展示 `currentPhase`，结果区只展示最终交付物：

- `inline`：直接结果正文
- `artifact`：短摘要 + 文档卡片

文档产物不是默认输出，只有在用户明确要求文档交付时才生成。

Updated: 2026-04-09

## 11. 2026-04-13 `site_overview` 单站概况模式

- 新增 `site_overview` task module，面向用户给出明确 URL、明确站点名，或询问某公司官网产品/平台/文档/价格等官方信息的单站概况任务。
- 当前单站读取范围固定为：可信入口主页 + 主页一跳导航中的高价值页面；不做深层整站 crawl，不读取下载型附件，不输出“完整站点确认”。
- `site_overview` 主链为：`compileTaskSpec -> resolveEntryPoint -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult`。
- `resolveEntryPoint` 负责显式 URL 直达校验，或在未给 URL 时做一次有界官网入口解析。
- 主页导航候选先由规则过滤和打分，再由 LLM 对已过滤候选做有界重排；LLM 不允许新增 URL，非法重排回退规则顺序。
- 次要页面正文少于 `LIMITS.PAGE_TEXT_MIN_LENGTH`、404、登录墙、导航失败或正文不可读时，记录为未解决问题并继续读取替补候选。

Updated: 2026-04-13
