# Browser Agent 当前代码现状

## 1. 当前结论

当前代码的真实状态是：

- 旧版双模块 workflow 已能跑通
- 当前实现仍是 `phase-driven deterministic loop`
- 新设计要求的 `LLM plan-driven tool orchestration` 还没有真正落地

因此：

- 现有代码是迁移基线
- 不是新的设计真相

## 2. 已有可复用资产

### 2.1 旧版两条主链已经跑通

证据：

- `src/background/runtime.ts`
- `src/background/tools.ts`
- `tests/runtime-tools.test.ts`
- `tests/public-research.test.ts`

现状：

- `commerce_search` 可走完整固定主链
- `public_research` 可走完整固定主链
- 这两条链路适合作为迁移后的回归基线

### 2.2 任务编译和 plan 雏形已经存在

证据：

- `src/background/query-compiler.ts`
- `src/shared/types.ts`

现状：

- `compileTask` 已能生成 `taskType`、`taskSpec`、`taskPlan`
- `taskPlan.steps` 已有 `goal`、`allowedTools`、`successCriteria`
- 但当前 `taskPlan` 仍更像说明性产物，不是实际执行契约

### 2.3 现有 tool 注册表已经存在

证据：

- `src/background/tools.ts`

现状：

- 已有可识别的 runtime-visible tool 名称：
  - `compileTask`
  - `searchInSite`
  - `extractStructuredResults`
  - `filterCandidates`
  - `readPageFacts`
  - `aggregateTaskResults`
- 这些工具是迁移到新范式时最自然的第一批候选

### 2.4 状态展示和回归测试已存在

证据：

- `src/sidepanel/index.ts`
- `src/sidepanel/i18n.ts`
- `tests/query-compiler.test.ts`
- `tests/runtime-tools.test.ts`
- `tests/scanner.test.ts`
- `tests/public-research.test.ts`

现状：

- Side Panel 已有 session / timeline / 结果展示基础
- 自动化测试已覆盖旧架构下的核心回归

## 3. 相对新设计的主要差距

### 3.1 Runtime 仍然硬编码 `phase -> tool`

证据：

- `src/background/runtime.ts`
- `src/background/tools.ts`

现状：

- runtime 当前仍按 `currentPhase` 选择 tool
- 还不是“LLM 根据 plan 和 tool result 选择下一步 tool”

影响：

- 旧链路稳定
- 但无法支撑更通用的 tool 组合

### 3.2 Tools 仍直接推进 phase

证据：

- `src/background/tools.ts`

现状：

- 多个 tool 直接写 `memory.currentPhase`
- 返回结果仍以 `nextPhase` 为核心

影响：

- tool 仍绑定旧状态机
- 迁移后需要改成以 `tool result` 为核心，而不是直接改 phase

### 3.3 缺少统一的 tool result 协议

证据：

- `src/background/tools.ts`
- `src/shared/types.ts`

现状：

- 当前返回结构更偏向旧循环
- 缺少统一的 `success / partial / retryable_error / fatal_error`
- 缺少通用 `artifacts / facts / errorCode / retryHint`

影响：

- LLM 很难稳定判断“重试还是下一步”

### 3.4 Memory 仍偏向旧双工作流

证据：

- `src/shared/types.ts`
- `src/background/runtime.ts`

现状：

- memory 里仍大量围绕 `currentPhase`、候选列表、研究来源
- 还没有以 `plan + step status + artifacts + tool results` 为中心

影响：

- 对新增文档/文件类任务支持不足

### 3.5 新范式需要的文件类 tools 尚未出现

当前尚未看到：

- `downloadArtifact`
- `extractPdfText`
- 更通用的 artifact 处理链路

影响：

- 还无法验证“下载资料 + PDF 转文本 + 汇总”这类新模块

## 4. 当前阶段判断

当前项目更准确的定位是：

- 旧架构已具备可跑通基线
- 新架构设计已明确
- 代码仍处在迁移前状态

因此下一阶段重点不应再是补更多固定 workflow，而应是：

- 把执行契约迁到 `静态 plan + LLM 编排 tool + runtime 护栏`

## 5. 下一步最小闭环建议

建议按以下顺序推进：

1. 冻结现有 `commerce_search / public_research` 作为迁移回归基线
2. 在 `src/shared/types.ts` 中先定义统一的 `PlanStep` 和 `ToolResult`
3. 将 `Runtime` 改为“plan 执行器 + 护栏层”
4. 将现有 tools 改为返回结构化结果，不再直接控制全局 phase
5. 先让 `commerce_search` 跑通新循环
6. 再迁移 `public_research`
7. 最后增加一个文档/文件类试点，例如“下载资料 + PDF 转文本 + 汇总”

Updated: 2026-04-03
