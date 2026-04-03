# Browser Agent 状态检查点

## 1. Current Phase

`planning`

## 2. Current Focus

先把文档协议与迁移路径固定，再开始代码迁移：

- 固定 `spec / constraints / plan / status / acceptance`
- 固定 `threads` 目录与模板协议
- 为代码迁移准备 `PlanStep / ToolResult / runtime guardrails`

## 3. Done

- 已明确将执行范式切换为 `LLM plan-driven tool orchestration`
- 已将旧版核心文档归档到 `doc/history/2026-04-03-plan-driven-rewrite/`
- 已重写 [spec.md](D:/code/browser-agent-mvp/doc/spec.md) 为新设计真相
- 已重写 [acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md) 为“旧基线 + 新迁移验收”
- 已补充 [constraints.md](D:/code/browser-agent-mvp/doc/constraints.md) 与 [plan.md](D:/code/browser-agent-mvp/doc/plan.md)

## 4. In Progress

- 将 `status.md` 收口为 checkpoint 胶囊
- 将 `threads/` 收口为 `templates / active / closed`
- 为后续代码迁移固定最小协议层

## 5. Blockers

- 当前代码仍是旧的 `phase-driven deterministic loop`
- `PlanStep`、`ToolResult`、新 memory 字段尚未在代码中落地
- runtime 最小护栏仍未在代码中实现
- token / 修改轮次预算有限，需要优先打最关键的协议与执行闭环

## 6. Rejected Paths

- 继续为每个任务模块堆固定 workflow
- 直接把 raw DOM 原子动作暴露给 LLM
- 在当前预算约束下并行维护两个迁移仓库

## 7. Next Actions

1. 在 `src/shared/types.ts` 中定义 `PlanStep` 与 `ToolResult`
2. 将 `Runtime` 改为最小 plan 执行器 + 护栏层
3. 将现有 tools 改为返回结构化结果，不再直接控制全局 phase
4. 先迁移 `commerce_search`
5. 再迁移 `public_research`

## 8. Needs Human Decision

- 当前无必须立刻拍板的架构问题
- 若开始代码迁移，建议直接在当前仓库新分支推进，而不是双仓并行

Updated: 2026-04-03
