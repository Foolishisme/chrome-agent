# ADR 0003: 采用分类的 Browser Research Workflow

## 1. 背景

在 `0001-plan-driven-orchestration` 和 `0002-converge-runtime-tool-contracts` 之后，主线已经收口为：

- `LLM` 负责规划与路由
- `Tools` 负责语义能力与局部恢复
- `Runtime` 只负责最小执行循环与护栏

随着能力继续扩展，项目开始面对一个新的设计问题：

- `public_research` 目前只覆盖 Google 第一页来源筛选、逐页读取和汇总
- 用户的新需求开始包含：
  - 单站点概况型调研
  - 官网资料发现与阅读
  - 多站点概况型调研
  - 后续可能出现的精确信息确认任务
- 团队也开始讨论：
  - 是否先做“通用调研 agent”
  - 是否拆成“先判断要不要调研，再判断调研类型”
  - 是否把下载、附件跟进、文档解析抽成独立 tool

实际讨论已经暴露出一个核心问题：

- 如果直接追求“一个开放式通用调研 agent”，任务边界会过早失控
- 如果按页面动作来设计主链，很容易重新退化成“搜索、点开、下载、再点开”的原子编排
- 如果四类调研同时开做，当前主线会在没有证据的情况下过度膨胀

因此，需要先对“广义网页调研”本身进行分类收口。

## 2. 决策

当前采用“分类 workflow”而不是“开放式通用 research agent”。

### 2.1 顶层方向

顶层继续保持三类方向：

- `direct_answer`
- `commerce_search`
- `browser_research`

其中：

- `direct_answer` 是非浏览器证据获取分支
- `commerce_search` 继续保持独立垂直任务模块
- `browser_research` 承接广义网页调研

### 2.2 路由规则

`compileTaskSpec` 在一次路由中同时完成：

- 当前目标是否需要浏览器调研
- 如果需要，进入哪一种任务 mode

当前不采用“先判断是否调研，再二次判断具体 mode”的两次独立大判断。

### 2.3 Browser Research 分类

`browser_research` 当前先只收口两个概况型 mode：

- `site_overview`
- `multi_source_overview`

其中：

- `public_research` 当前视为 `multi_source_overview` 的已实现代表分支
- `site_overview` 作为下一阶段主目标
- `site_precise / multi_source_precise` 暂不进入主线承诺

### 2.4 统一骨架

广义网页调研采用统一最小骨架：

`compileTaskSpec -> acquireCandidates -> readSourceFacts -> validateOrAggregate -> finalizeResult`

当前优先原则是：

- 先统一任务骨架
- 再按 mode 切换候选获取与结果聚合方式
- 不急于为每个 mode 增加一批新的 runtime-visible tool 名称

### 2.5 下载与附件处理

下载、附件跟进、文档解析继续放在读取类 tool 内部处理。

当前不新增独立 `download` runtime-visible tool。

## 3. 被放弃方案

### 3.1 先做一个开放式通用调研 Agent

放弃原因：

- 当前范围下难以稳定定义完成条件
- 容易把 runtime 和 tool 再次拉回原子动作编排
- 会过早把“多级跳转、下载、解析、验证”全部暴露成主链复杂度

### 3.2 先判断“要不要调研”，再判断“属于哪种调研”

放弃原因：

- 会增加一次额外的大判断
- 边界问题容易在两次分类之间漂移
- 不如一次性产出最终 task mode 稳定

### 3.3 四类 workflow 同时进入主线

放弃原因：

- `site_precise / multi_source_precise` 对证据闭环要求更高
- 当前还没有足够证据支撑精准型 research 的主线稳定性
- 概况型 workflow 更适合作为下一阶段最小扩展

### 3.4 把下载单独抽成 runtime-visible tool

放弃原因：

- “下载”本身不是稳定语义能力，而是读取证据过程中的内部动作
- 会诱导主链退化成“拿 URL -> 下载 -> 再解析”的原子链
- 不符合当前 `tool-internal step` 与 `runtime-visible tool` 的边界

## 4. 影响

直接影响：

- `doc/spec.md`
  - 需要明确顶层三类方向与 `browser_research` 的 mode 规划
- `doc/plan.md`
  - 需要把 `site_overview MVP` 写成下一阶段主目标
- `doc/status.md`
  - 需要记录当前只拍板了概况型 mode，精准型仍未进入主线
- `doc/acceptance.md`
  - 需要为 `site_overview` 与一次性路由补预备验收项
- `doc/thread_bootstrap.md`
  - 新线程启动时需要先判断当前属于哪一种 mode

后续影响：

- `public_research` 不再被视为“唯一通用调研形态”，而是 `browser_research` 的一个代表分支
- 下一阶段新增能力时，优先沿 `site_overview / multi_source_overview` 收口
- 精准型 research 只有在概况型主链稳定后才进入实现优先级
- 站内多级跳转、附件跟进、文档下载与解析将继续优先留在 tool 内部，不暴露给 `LLM` 编排

Updated: 2026-04-09
