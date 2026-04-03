# Browser Agent 状态检查点

## 1. Current Phase

`migration`

## 2. Current Focus

先按新迁移路径推进代码落地：

- 保持文档协议与迁移路径一致
- 先将旧 `phase` 工具收敛为少量粗颗粒过渡 tool
- 再将 runtime 从 `phase -> tool` 调度迁移到 plan 执行器

## 3. Done

- 已明确将执行范式切换为 `LLM plan-driven tool orchestration`
- 已将旧版核心文档归档到 `doc/history/2026-04-03-plan-driven-rewrite/`
- 已重写 [spec.md](D:/code/browser-agent-mvp/doc/spec.md) 为新设计真相
- 已重写 [acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md) 为“旧基线 + 新迁移验收”
- 已补充 [constraints.md](D:/code/browser-agent-mvp/doc/constraints.md) 与 [plan.md](D:/code/browser-agent-mvp/doc/plan.md)
- 已将迁移路径调整为“先切范式、先用少量大工具过渡、再按需要细拆”
- 已将旧工具边界收敛为第一批过渡 tool 命名：
  - `compileTaskSpec`
  - `openSearchResults`
  - `collectCommerceCandidates`
  - `collectResearchCandidates`
  - `readResearchSourceFacts`
  - `finalizeCommerceResult`
  - `finalizeResearchResult`
- 已在 `src/shared/types.ts` 中落地 `PlanStep` 与新的高层 `ToolResult`
- 已将原子 DOM 动作结果与高层 tool 结果解耦：
  - 原子动作结果改为 `ActionResult`
  - 高层 tool 返回结构化 `ToolResult`
- 已将 `Runtime` 改为基于 `plan step / allowedTools` 选择 tool，不再直接按 `phase -> tool` 硬编码调度
- 已让 side panel 显示结构化 plan step 状态，而不是旧的字符串 plan
- 已同步更新对应测试，并确认 `npm.cmd test` 与 `npm.cmd run build` 通过

## 4. In Progress

- 将 `Runtime` 从“基于 plan step 选 tool”继续推进到“由 LLM 决定当前 step 内的下一步 tool”
- 将 runtime 最小护栏补齐到 `budget_low / hard stop / no progress`
- 将当前内存与最终输出协议继续对齐到新范式

## 5. Blockers

- 当前 runtime 已按 plan step 调度 tool，但仍保留 `currentPhase` 作为兼容状态字段
- 真实的 LLM 选 tool 仍未接入，当前仅以 `allowedTools[0]` 的确定性选择保证不越权
- runtime 最小护栏仍未在代码中实现
- `readResearchSourceFacts` 仍包含局部串行读取逻辑，后续需要决定保留边界还是继续收口到 plan

## 6. Rejected Paths

- 继续为每个任务模块堆固定 workflow
- 直接把 raw DOM 原子动作暴露给 LLM
- 在当前预算约束下并行维护两个迁移仓库

## 7. Next Actions

1. 在 runtime 中补齐软预算、硬停止、同 tool 失败和无进展护栏
2. 将“当前 step 选哪个 tool”从确定性 `allowedTools[0]` 升级为 LLM 决策
3. 为 `commerce_search` 新循环补集成验收
4. 为 `public_research` 新循环补集成验收
5. 再决定是否继续细拆 `collect*` / `readResearchSourceFacts`

## 8. Needs Human Decision

- 当前无必须立刻拍板的架构问题
- 若开始代码迁移，建议直接在当前仓库新分支推进，而不是双仓并行

Updated: 2026-04-03
