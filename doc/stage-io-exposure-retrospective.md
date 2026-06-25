# 阶段 I/O 暴露乱象复盘

## 1. 背景

本次修复聚焦主流程的阶段输入输出边界。问题不是浏览器能力本身不可用，而是 public research 主链把内部执行细节混进了跨模块 contract、LLM prompt 和部分测试 fixture。

理想边界应当是：

- 用户输入任务目标。
- runner 内部完成搜索、过滤、重排、页面读取、失败归并和恢复。
- LLM 只看到裁剪后的证据包和必要缺口。
- 用户只看到最终答案和必要引用。

实际代码一度把候选数、读取数、过滤诊断、round patch 和部分策略字段暴露到更高层，造成 LLM 负担增加，也让未来维护者容易误以为这些内部参数是产品语义。

## 2. 乱象表现

### 2.1 TaskSpec 混入执行策略

`PublicResearchTaskSpec` 曾同时表达用户语义和执行策略：

- `searchQuery` 是语义输入。
- `candidateLimit`、`sourceTargetCount` 是内部执行策略。

这导致调用方、测试和 LLM round decision 都能看到或调整这些字段。字段越多，越容易把“默认怎么跑”误解成“用户想要什么”。

### 2.2 LLM prompt 噪音过多

round decision prompt 曾接收候选列表、source 细节、`filterDiagnostics` 和完整 task spec，并允许 patch 候选数、读取数、页面读取上限、商品抽取上限等字段。

这些信息对 debug 有用，但对 LLM 做 `finalize / replan / abort` 决策不是必要输入。LLM 需要的是证据是否足够、缺口是什么、是否需要换 query，而不是过滤器跳过了多少 PDF 或内部默认读取几页。

### 2.3 用户结果承担了不必要的过程负担

普通用户不需要知道搜索、过滤、重排、恢复和读取统计。用户只需要最终答案、必要引用，以及会影响结论可靠性的限制说明。

过程信息如果进入 UI 或 archive，会让产品从“浏览器 Agent”变成“运行日志阅读器”。这与当前 Side Panel 只展示最小运行占位和最终结果的契约冲突。

## 3. 为什么会发生

### 3.1 类型边界一开始偏执行视角

早期为了让流程跑通，`taskSpec` 承担了太多职责：既保存任务语义，也保存执行预算和采样参数。这样实现快，但会让策略字段自然流向 runner、LLM 和测试。

### 3.2 缺少显式的 LLM 输入投影

如果 prompt builder 直接序列化完整对象，内部字段就会自动进入 LLM 上下文。随着对象增长，prompt 噪音也增长。问题的根因不是某一个字段，而是缺少“prompt DTO 必须显式构造”的规则。

### 3.3 debug 信息和产品 contract 没有分层

过滤诊断、失败路径和工具事件本来适合 run log/debug bundle；但如果没有明确层级，它们容易被复用到 round decision、final synthesis 或 UI。复用看起来省事，实际会扩大暴露面。

### 3.4 默认值没有集中到 policy

候选池大小、默认读取页数、并发、正文裁剪长度和最大轮次属于 runtime policy。它们分散在 task spec 或各模块常量里时，上层调用方会误以为需要理解和传递这些参数。

## 4. 本次修复

### 4.1 引入内部 policy

新增 `ResearchRuntimePolicy` 和 `RESEARCH_RUNTIME_POLICY`，集中管理 public research 的内部默认策略：

- 候选池大小。
- 默认读取页数。
- 页面读取并发。
- 正文裁剪长度。
- 最大 runtime round。

这些默认值不再进入 `PublicResearchTaskSpec`。

### 4.2 收敛 public research task spec

`PublicResearchTaskSpec` 只保留任务语义：

- 原始目标。
- 输出模式。
- 时间上下文。
- 搜索 query。
- query 来源。
- notes。
- 搜索引擎。

`candidateLimit` 和 `sourceTargetCount` 已移除，不做旧兼容。

### 4.3 增加聚合证据包

新增 `ResearchEvidenceBundle`，作为 public research 给 LLM 的稳定证据输入。它只包含裁剪后的页面结果、关键事实、来源 URL、状态和 caveats。

runner 内部仍可以搜索、过滤、重排和并发读取，但后续阶段只消费 evidence bundle。

### 4.4 收紧 round decision

round decision schema 只允许 patch：

- `searchQuery`
- `officialSearchQuery`
- `notesAppend`

它不再允许 LLM 修改候选数、读取数、并发、页面读取上限、商品抽取上限或其他 runtime strategy。

### 4.5 prompt 脱敏

final prompt 和 round decision prompt 不再直接序列化完整 task spec。prompt builder 会先构造脱敏后的 prompt task spec，只保留 LLM 需要理解任务和证据的字段。

测试中新增了防回归断言，确保 prompt 不包含：

- `filterDiagnostics`
- `candidateLimit`
- `sourceTargetCount`
- `topK`
- `llmInputLimit`
- `extractLimit`

## 5. 当前分层规则

### 用户可见

用户只看：

- 最终答案。
- 必要引用。
- 影响结论可靠性的简短限制说明。

用户不看：

- 当前 tool。
- 执行 timeline。
- 过滤计数。
- round patch。
- retry/recovery 细节。

### LLM 可见

LLM 只看：

- 用户目标。
- 脱敏 task spec。
- 裁剪后的 evidence bundle。
- 必要 unresolved issues。
- 可调整的 query/notes。

LLM 不看：

- 完整 memory。
- raw tool result。
- runtime policy。
- filter diagnostics。
- step history。
- action/selector/recovery 细节。

### debug 可见

debug bundle 和 run log 可以保留：

- 工具事件。
- 状态。
- 错误上下文。
- 过滤诊断。
- 必要的定位信息。

debug 信息不作为普通产品输出，也不作为 LLM 常规输入。

### 纯内部

纯内部包含：

- 候选池大小。
- 默认读取页数。
- 并发。
- 裁剪长度。
- retry/recovery。
- selector/action/等待细节。

这些只允许在 runtime、runner、tool 或 content action 内部流动。

## 6. 后续预防

新增流程时必须先回答四个问题：

1. 哪些字段属于任务语义？
2. 哪些字段属于内部 runtime policy？
3. 哪些字段是 LLM 可见 evidence？
4. 哪些字段只允许进入 debug？

实现上遵循以下规则：

- 不直接把完整 `taskSpec`、`memory` 或 raw tool result 序列化进 prompt。
- 每个 prompt builder 必须使用显式 prompt DTO。
- LLM patch schema 默认 `.strict()`，只允许业务上确实需要 LLM 决策的字段。
- 默认值放进 policy，不放进 task spec。
- public state 和 conversation archive 只保存用户可见终态结果。
- 对关键 prompt 增加 `not.toContain(...)` 防回归测试。

## 7. 验证状态

本次修复后已验证：

- `npx tsc --noEmit`
- `npm run check:fast`
- `npm test`
- `npm run build`
- 聚焦测试：`query-compiler`、`public-research`、`runtime-tool-loop`、`llm-runtime-contract-schemas`、`session-archive`、`llm-client`、`research-search-quality`、`run-log-store`、`agent-runtime`

`npm run check:repo` 在当前 macOS 环境因缺少 `powershell` 无法完整执行。已执行到 `check:unused` 和 dependency-cruiser 通过，后续 PowerShell 子检查被环境阻断。

更新日期：2026-06-03
