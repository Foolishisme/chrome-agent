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

1. 补齐真机护栏验证
2. 提升 `public_research` 第一天第一页候选质量与命中率
3. 打通自动化真机扩展验证链路
4. 最后才考虑是否继续细拆 tool 或扩展 PDF artifact

## 5. 当前建议顺序

### 5.1 真机护栏验证

优先验证：

- `budgetLow`、连续失败、无进展在 UI 中的可见性
- `public_research` 停止 / 异常路径

说明：

- `commerce_search / public_research` 主链闭环当前已记录为 `user-reported`
- 当前缺的不是主链是否能跑，而是护栏在真实 UI 中是否可见、可理解

### 5.2 产物输出主链

已落地：

- `FinalResult.outputMode = inline | artifact`
- 默认只做 `inline` 结果输出
- 仅当用户明确要求“文档 / 报告 / markdown / 文件”时，生成 markdown artifact
- Side Panel 结果区已收口为“最终交付物”，运行细节回收到 runtime 区

当前不建议：

- 把“下载”设计成给 `LLM` 选择的 runtime-visible tool
- 把“是否产文档”放给 `finalize` 阶段临时猜测
- 为了导出能力先做完整文件系统抽象
- 让前端对整段对话、日志、timeline 做统一下载

### 5.3 第一页来源质量

优先落地：

- 保持 `public_research` 只读 Google 第一页候选
- 先做第一页候选过滤后的轻量重排序
- 对 query、标题、域名、snippet 做快速 LLM 重排
- 排序失败时严格回退到过滤后原顺序

当前不建议：

- 直接把有效来源目标从 3 提到 5
- 在没有证据前先翻第二页
- 让 LLM 自由增删候选链接

### 5.4 基于证据的细拆

只有在出现明确复用或失败模式时，才考虑继续细拆：

- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`

当前不为了结构整齐而继续拆分。

### 5.5 扩展新能力

在主链稳定前，不优先做：

- 长记忆泛化
- 完整的 `LLM` 可选工具通用化
- 执行中动态改 plan
- 原子 DOM 动作开放给 LLM
- 大而全的通用 adapter

## 6. 当前明确不做

当前不做：

- 回退到旧 alias tool 和旧状态双轨
- 恢复 `currentPhase`
- 继续维护兼容层让新旧协议长期并存
- 把“下载文件”单独抽成 runtime-visible tool
- 为了形式整齐引入更多中间抽象

Updated: 2026-04-07
