# Browser Agent 约束清单

## 1. 文档定位

本文件只记录当前主线下的硬约束、禁区和红线。

它回答：

- 绝对不能怎么做
- 哪些边界当前不能跨
- 哪些修改需要人工批准

它不记录：

- 当前采用的迁移路径
- 当前进度
- 历史复盘

## 2. 架构红线

当前必须坚持：

- `LLM` 是 agent 的决策核心
- `Runtime` 只做最小保障层，不做业务主脑
- `Tools` 只暴露稳定、可组合的能力边界
- `Memory` 只保留结构化工作记忆

当前明确禁止：

- 为每个任务模块继续堆新的固定 workflow
- 把 `Runtime` 重新做成复杂状态机引擎
- 让 `LLM` 直接决定 raw DOM 动作、selector 和等待细节
- 把 tool 内部局部恢复暴露为 `LLM` 直接编排的纯原子动作

## 3. 执行红线

当前 v1 必须遵守：

- 执行范式是 `LLM plan-driven tool orchestration`
- plan 当前只允许静态初始生成，执行中只更新 step 状态
- 当前不支持执行中复杂 plan 改写、插步、删步和大规模重排
- `LLM` 只能在当前 step 的 `allowedTools` 中选择下一步 tool
- `Tools` 不得擅自改写整个任务 plan
- `Runtime` 不得绕过 `LLM` 直接做任务级语义判断

## 4. Runtime 最小护栏

当前固定护栏为：

- `maxTotalSteps = 20`
- `softStepLimit = 15`
- `maxElapsedMs = 180000`
- `maxSameToolRetries = 3`
- `maxConsecutiveNoProgress = 3`

必须满足：

- 到达 `softStepLimit` 后，必须暴露 `budget_low`
- 到达 `maxTotalSteps` 或 `maxElapsedMs` 后，必须强制停止
- 同一 tool 连续失败达到 `maxSameToolRetries` 后，不再继续盲试
- 连续 `maxConsecutiveNoProgress` 步无进展后，必须停止并返回失败

## 5. 输出红线

无论成功失败，最终都必须返回结构化输出。

顶层状态只能是：

- `success`
- `partial`
- `failed`
- `blocked`

不允许：

- 只返回原始日志
- 只返回一句失败提示
- 失败后没有 `errorsOrBlockers`
- 失败后没有 `suggestedNextAction`

## 6. 代码与依赖约束

当前必须遵守：

- 在新架构迁移完成前，保留 `commerce_search / public_research` 作为旧链路回归基线
- 新增 `runtime-visible tool` 时，必须同时定义其能力契约、输入输出和验收方式
- 新增文件/文档类能力时，优先作为稳定语义 tool 暴露，不先暴露一串原子动作

当前高风险变更默认需要额外说明或人工批准：

- 自动购买、支付或其他真实外部高风险执行
- 引入会改变核心执行链路的外部依赖
- 引入需要真实账号、长期登录态或敏感权限的自动化能力
- 破坏现有输出 schema 或回归基线的兼容性修改

## 7. 人工批准项

以下事项默认不能由线程自行拍板：

- 是否允许真实账号环境下的自动化执行
- 是否引入高成本第三方服务或付费依赖
- 是否接受向后不兼容的输出/协议调整
- 是否将当前 v1 升级为支持复杂 plan 改写

Updated: 2026-04-03
