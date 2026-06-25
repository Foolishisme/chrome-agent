# Browser Agent 约束清单

## 1. 定位

本文记录当前主路径的硬约束和禁区。

## 2. 架构约束

必须成立：

- 产品目标是通用浏览器 Agent。
- 当前唯一主链是 `BrowserAgentRuntime -> runner -> RuntimeBrowserDriver -> content bridge -> scanner/content-action-executor/research/extractor`。
- `Runtime` 是最小保障层，负责 session 生命周期、预算、stop、状态广播和终态兜底。
- `Tools` 暴露稳定语义能力，不暴露页面级 atomic tool 表面。
- 当前 runtime-visible tools 仅为 `browser.search`、`browser.webDetail`、`browser.siteOverview`、`skill.commerceResearch`。
- 默认浏览器控制通过 `RuntimeBrowserDriver` 和 content message 协议完成。
- 阶段输入输出必须按可见层级组织：`TaskSpec` 是语义输入，`RuntimePolicy` 是内部执行策略，`EvidenceBundle` 是 LLM 可见证据，`FinalResult` 是用户可见结果，`DebugBundle/run log` 是显式调试材料。
- public research 的候选池大小、默认读取页数、并发、正文裁剪长度和最大轮次属于 `ResearchRuntimePolicy`，不属于 `PublicResearchTaskSpec`。
- 新增 helper、adapter、fallback、compatibility layer 或 abstraction 必须有当前存在性证明。

禁止：

- 把 Runtime 扩成 workflow engine。
- 用未接入主链的平行 driver、facade、content bridge 或 schema 保留未来路径。
- 把 bounded execution 扩成 unbounded DAG orchestration。
- 把 task-family modules 当成产品架构边界。
- 把内部执行策略字段放进 task spec、LLM patch schema、public state 或 conversation archive。
- 让 LLM 输出未注册 action、任意 selector、任意 JS 或 unrestricted evaluate。
- 为“以后可能有用”保留源码、测试、协议或文档入口。

## 3. 执行约束

必须成立：

- 每轮都有 action limit、tool allowlist、预算和 failure policy。
- Runner 可以按当前 metadata 调度，但不能添加业务语义。
- Tool result 必须短、结构化、带来源或失败解释。
- 页面内容进入 LLM 前必须裁剪、脱水或结构化。
- Search、read、click 和 type 能力必须有预算、超时和失败路径。
- 高风险真实账号动作必须阻断或进入人工确认。
- 后台 run log 只记录工具级事件、状态、错误和必要诊断上下文。
- LLM prompt 必须通过显式 prompt DTO 或 evidence bundle 构造；进入 prompt 前必须脱敏 task spec 和证据。
- LLM round decision 只能调整 query/notes，不能调整候选数、读取数、并发、裁剪长度、extract limit、retry 或恢复策略。

禁止：

- 绕过 tool 权限或安全边界。
- 让 tools 改写产品目标。
- 把 tool 内部恢复步骤暴露给 LLM。
- 把完整 `taskSpec`、`memory`、raw tool result、`filterDiagnostics`、`runtimeMeta`、`stepHistory` 或 `currentTool` 直接序列化进常规 LLM prompt。
- 把未裁剪页面噪音写进 memory。
- 重新引入已删除的内部 QA route 或未接入产品流的后台消息。
- 在 Side Panel 展示 runtime debug panel、执行 timeline、调试日志、当前 step/tool 或 thinking 过程。
- 把思考链、中间推理过程、raw prompt、raw model intermediate text、过滤诊断、round patch 或 runtime policy 写入 public state 或 conversation archive。

## 4. 权限边界

- 默认权限：`activeTab`、`scripting`、`storage` 和当前 manifest 已声明的必要 host permissions。
- `debugger`、`cookies`、`identity`、`declarativeNetRequest` 不属于当前默认路径。
- 商店分发路径必须避免扩大权限，除非有当前任务、事实源和 active call path 支持。

## 5. 输出约束

终态 status 只能是：

- `success`
- `partial`
- `failed`
- `blocked`

每个终态结果包含用户可读 summary、关键来源或覆盖边界、必要的 errors/blockers，以及失败或 blocked 时的 suggested next action。

用户普通结果只展示答案和必要引用；过程、过滤、重试、恢复和读取统计默认隐藏。只有覆盖不足或失败会影响结论可靠性时，才用简短限制说明进入最终回答。

更新日期：2026-06-03
