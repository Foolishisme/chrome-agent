# ADR 0002: 收口 runtime/tool 契约并移除过渡兼容层

## 1. 背景

`0001-plan-driven-orchestration` 已经把项目主线从 `phase-driven deterministic loop` 切到 `LLM plan-driven tool orchestration`。

但当前代码仍保留了明显的过渡态：

- `currentPhase` 仍在主链中参与推进
- 旧 tool 名与新 tool 名双轨并存
- action 级返回与高层 tool 返回混用同一个 `ToolResult`
- `finalSummary / finalOutput / finalResult` 三套结果字段并存
- runtime 仍通过 `stepId / phase` 推断部分业务语义

这导致当前实现的复杂度主要来自迁移残留，而不是任务模块本身。

## 2. 决策

本轮对主链做一次性收口，不保留长期兼容层：

- 只保留一套 canonical tool：
  - `compileTaskSpec`
  - `openSearchResults`
  - `collectCommerceCandidates`
  - `collectResearchCandidates`
  - `readResearchSourceFacts`
  - `finalizeCommerceResult`
  - `finalizeResearchResult`
- 只保留一套高层 `ToolResult`，用于 runtime-visible tool 返回
- 原内容脚本的原子动作返回独立命名为 `ActionResult`
- 只保留一套最终 `FinalResult`
- `currentPhase` 退出主链
- runtime 不再按 `stepId / phase` 硬编码业务语义
- runtime 执行规则固定为：
  - 当前 step 只有一个 `allowedTool` 时直接执行
  - 当前 step 有多个 `allowedTools` 时才调用 LLM 选 tool

## 3. 被放弃方案

### 3.1 继续长期保留兼容层

放弃原因：

- 双轨命名和双轨状态会持续增加理解成本
- 每次新增能力都要同时兼容旧协议和新协议
- 过渡态会从“临时方案”固化成长期负债

### 3.2 继续让 runtime 维护隐式 workflow

放弃原因：

- runtime 会重新膨胀成任务推进主脑
- `LLM + Tools + Memory + Runtime` 的边界会再次模糊
- 后续新能力仍会被迫绑定固定顺序

### 3.3 为了形式整齐继续堆更多中间抽象

放弃原因：

- 当前问题不是抽象太少，而是旧抽象没有退出
- 继续叠中间层只会让迁移更难收口

## 4. 影响

本决策会直接影响以下部分：

- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/background/prompting.ts`
- `src/background/llm-client.ts`
- `src/background/query-compiler.ts`
- `src/background/runtime.ts`
- `src/background/tools/`
- `src/sidepanel/index.ts`
- `tests/`
- `doc/spec.md / constraints.md / plan.md / status.md / acceptance.md`

收口完成后，当前主线以 canonical tool、统一状态模型和统一最终输出作为唯一实现基线。
