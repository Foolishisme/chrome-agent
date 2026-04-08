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

1. 先完成 Side Panel 交互收口 v1
2. 再补齐真机护栏验证
3. 然后验证 `public_research` 第一页候选质量提升是否真实有效
4. 打通自动化真机扩展验证链路
5. 最后才考虑是否继续细拆 tool 或扩展 PDF artifact

## 5. 当前建议顺序

### 5.1 Side Panel 交互收口 v1

优先落地：

- 初始态不展示空的“运行状态 / 结果”区
- 按会话状态切换主按钮：
  - 初始态只显示 `开始`
  - 运行中只显示 `停止`
  - 完成或失败后再显示“再次运行”或复用 `开始`
- 运行中时间线默认展开
- 最终结果出现后，时间线自动缩略为折叠态

当前不建议：

- 现在就做真正的 token 级流式结果输出
- 为了“像聊天”而把 runtime 细节重新塞回结果区
- 先实现长对话 / 长记忆 UI

布局约束：

- 最终交付物始终优先于运行细节
- 如果后续引入长对话或 memory 区，默认放在最终输出之后

### 5.2 真机护栏验证

优先验证：

- `budgetLow`、连续失败、无进展在 UI 中的可见性
- `public_research` 停止 / 异常路径

说明：

- `commerce_search / public_research` 主链闭环当前已记录为 `user-reported`
- 当前缺的不是主链是否能跑，而是护栏在真实 UI 中是否可见、可理解

### 5.3 产物输出主链

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

### 5.4 第一页来源质量

优先落地：

- 保持 `public_research` 只读 Google 第一页候选
- 先做第一页候选过滤后的轻量重排序
- 对 query、标题、域名、snippet 做快速 LLM 重排
- 排序失败时严格回退到过滤后原顺序

当前不建议：

- 直接把有效来源目标从 3 提到 5
- 在没有证据前先翻第二页
- 让 LLM 自由增删候选链接

### 5.5 基于证据的细拆

只有在出现明确复用或失败模式时，才考虑继续细拆：

- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`

当前不为了结构整齐而继续拆分。

### 5.6 扩展新能力

在主链稳定前，不优先做：

- 长记忆泛化
- 完整的 `LLM` 可选工具通用化
- 真正的流式结果生成协议
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

## 7. 2026-04-08 补充

### 7.1 research 页面正文输入

当前优先路径：

- `public_research` 来源页输入从“summary + keyPoints”收口为“title + bodyExcerpt”
- 页面提取层优先负责清洗正文、去噪和长度控制，不再强行替 LLM 做强摘要
- `Readability` 优先，结果不足时回退到现有 fallback
- `bodyExcerpt` 按段落拼接并限制上限，不做整页无限制透传

当前不建议：

- 在提取层继续堆更多规则式摘要模板来替 LLM 做总结
- 因为模型上下文足够大，就把整页原文无上限透传给最终汇总
- 混淆“代码擅长清洗 / LLM 擅长理解总结 / 人擅长评估验收”的边界

## 7.2 2026-04-08 Side Panel Follow-up

- 初始态不再显示空的“结果 / 运行状态”区
- 对话区主按钮收口为 `开始 / 停止`，不再暴露 `retry`
- 结果区采用半流式感知：最终结果出现前，先显示当前进展与执行时间线
- 最终结果出现后，执行时间线作为折叠的“执行 / 思考过程”保留在结果区
- 运行状态区继续承载摘要信息、日志和结构化细节，但在结果完成后默认折叠
- 仍不做真正的 token 级流式输出；当前只做符合现有 runtime 的半流式前端呈现
- 若后续引入 memory 长对话，布局顺序保持“最终输出在前，对话历史在后”

Updated: 2026-04-08
