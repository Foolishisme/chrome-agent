# Browser Agent 约束清单

## 1. 文档定位

本文档只记录当前主线下的硬约束、禁区和红线。

## 2. 架构红线

必须坚持：

- `LLM` 是决策核心
- `Runtime` 只做最小保障层
- `Tools` 只暴露稳定语义能力
- `Memory` 只保留结构化工作记忆

明确禁止：

- 再把 `Runtime` 膨胀成隐式 workflow 引擎
- 再按 `phase -> tool` 或 `stepId -> 业务语义` 写死主链
- 再保留旧 tool alias 作为长期兼容层
- 把 tool 内局部恢复拆成原子 DOM 动作交给 LLM 编排

## 3. 执行红线

当前 v1 必须遵守：

- 执行范式是 `LLM plan-driven tool orchestration`
- plan 只在启动时静态生成
- 执行中只更新 step 状态，不支持复杂改 plan
- 是否需要搜索必须在规划阶段显式判断
- 搜索判断输入至少包含：用户目标、当前绝对时间、用户时区、已有证据摘要及其获取时间
- 单工具 step 直接执行
- 多工具 step 才调用 LLM 选 tool
- 任何 LLM 选出的 tool 都必须属于当前 step 的 `allowedTools`

明确禁止：

- 对明显时效敏感的问题仅凭模型内置知识直接回答
- 在已有证据充足或问题属于稳定内置知识时，仍强制走搜索链路
- 只把“现在 / 今天 / 最近”这类相对时间词交给 LLM，而不提供绝对日期时间
- 让 LLM 绕过 `allowedTools`
- 让 tool 擅自改写整个 plan
- 让 runtime 替 LLM 做任务级语义决策

## 4. Runtime 红线

当前 runtime 顶层状态只允许：

- `idle`
- `running`
- `done`
- `error`

当前 runtime 最小护栏固定为：

- `maxTotalSteps = 20`
- `softStepLimit = 15`
- `maxElapsedMs = 180000`
- `maxSameToolRetries = 3`
- `maxConsecutiveNoProgress = 3`

必须满足：

- 预算趋紧时暴露 `budgetLow`
- 达到 `maxTotalSteps` 或 `maxElapsedMs` 后强制停止
- 同一 tool 连续 `retryable_error` 达 3 次后停止
- 连续 3 次无进展后停止
- 停止或异常路径仍要产出结构化 `FinalResult`

## 5. Tool 红线

当前只允许 canonical tool：

- `compileTaskSpec`
- `finalizeDirectAnswer`
- `openSearchResults`
- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`
- `finalizeCommerceResult`
- `finalizeResearchResult`

必须满足：

- runtime-visible tool 返回统一高层 `ToolResult`
- 内容脚本原子动作只返回 `ActionResult`
- 局部恢复留在 tool 内

明确禁止：

- 再用 `compileTask / searchInSite / extractStructuredResults / filterCandidates / readPageFacts / aggregateTaskResults`
- 让高层 tool 返回旧的 action-style 回执

## 6. 输出红线

无论成功或失败，最终都必须返回结构化结果。

最终状态只允许：

- `success`
- `partial`
- `failed`
- `blocked`

明确禁止：

- 只返回原始日志
- 只返回一句失败提示
- 失败后没有 `errorsOrBlockers`
- 失败后没有 `suggestedNextAction`

## 7. 风险边界

当前默认不允许：

- 下单、支付或其他高风险真实执行
- 需要真实账号长期登录态的自动化能力
- 引入会改变核心链路的高成本外部依赖而不说明风险
- 在没有说明的情况下做向后不兼容协议修改

## 8. 人工确认项

以下事项默认不能自行拍板：

- 是否允许真实账号环境下的高风险自动化
- 是否引入高成本付费依赖
- 是否接受向后不兼容的对外协议变化
- 是否将当前 v1 升级为执行中动态改 plan

Updated: 2026-04-07
