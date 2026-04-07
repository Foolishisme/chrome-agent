# Browser Agent 当前迁移路径

## 1. 文档定位

本文档只记录当前采用的迁移方案与执行路径，不再描述已经完成的过渡态目标。

## 2. 当前结论

`runtime/tool` 契约收口已完成，当前主线已经进入明确的 v1 形态：

- `用户目标 -> 生成静态 PlanStep[] -> runtime 执行`
- 单工具 step 直接执行
- 多工具 step 才调用 LLM 选 tool
- tool 内负责连贯子步骤和局部恢复
- runtime 只负责循环、护栏、记录、停止和统一输出

## 3. 本轮已完成

### 3.1 协议层

已完成：

- `ToolName` 收口为 7 个 canonical tool
- `ActionResult` 与高层 `ToolResult` 分离
- `FinalResult` 收口为单一最终输出协议
- `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 退出主链

### 3.2 Tool 层

已完成：

- `src/background/tools.ts` 拆为 `src/background/tools/`
- 拆出共享 helper / shared / registry
- 7 个 canonical tool 全部落地

### 3.3 Runtime 层

已完成：

- runtime 主循环改为 canonical plan loop
- 单工具直跑
- 多工具 step 才调用 `chooseNextTool`
- 移除按 `phase` / `stepId` 硬编码业务语义的推进逻辑
- 落地 `maxSameToolRetries = 3`
- 落地 `maxConsecutiveNoProgress = 3`
- stop / error 路径统一补 `FinalResult`

### 3.4 UI 与测试

已完成：

- Side Panel 改为读取 `finalResult`
- 不再展示 `currentPhase`
- 测试改为 canonical tool 命名和新结果协议

## 4. 当前后续路径

本轮之后的优先级是：

1. 真实环境闭环验证
2. 根据真实失败模式决定是否继续细拆 tool
3. 再评估文件 / PDF artifact 主链

## 5. 当前建议顺序

### 5.1 真实环境验证

优先验证：

- `commerce_search` 真机完整闭环
- `public_research` 停止 / 异常路径
- `budgetLow`、连续失败、无进展在 UI 中的可见性

### 5.2 基于证据的细拆

只有在出现明确复用或失败模式时，才考虑继续细拆：

- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`

当前不为了结构整齐而继续拆分。

### 5.3 扩展新能力

在主链稳定前，不优先做：

- 执行中动态改 plan
- 原子 DOM 动作开放给 LLM
- 大而全的通用 adapter

## 6. 当前明确不做

当前不做：

- 回退到旧 alias tool 和旧状态双轨
- 恢复 `currentPhase`
- 继续维护兼容层让新旧协议长期并存
- 为了形式整齐引入更多中间抽象

Updated: 2026-04-07
