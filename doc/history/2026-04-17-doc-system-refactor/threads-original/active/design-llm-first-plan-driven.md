# Design Thread

## 1. 基本信息

- Thread: `design-llm-first-plan-driven`
- Status: `DECIDED`
- Owner:
- Related taskModule: `commerce_search / public_research / future modules`
- Updated: 2026-04-03

## 2. Problem

需要重新明确 agent 的核心是谁，以及后续架构升级时 `LLM / Tools / Memory / Runtime` 应如何分工。

## 3. Constraints

- `doc/spec.md`: 当前执行范式已切换为 `LLM plan-driven tool orchestration`
- `doc/constraints.md`: 不能继续为每个任务模块堆固定 workflow，不能把 raw DOM 原子动作开放给 `LLM`
- 已知业务边界：当前已跑通的模块仍是 `commerce_search / public_research`
- 已知技术边界：现代码仍是旧的 `phase-driven deterministic loop`
- 明确不做：执行中复杂 plan 改写、开放世界浏览、一次性完美通用框架

## 4. Options

### Option A

- 做法：继续以 `Runtime` 为中心，为每个任务模块扩展固定 workflow
- 优点：短期看起来更稳、更接近现有实现
- 代价：新能力会持续把 runtime 推回状态机中心
- 风险：`LLM` 退化成固定流程中的填空器，tool 难以复用组合

### Option B

- 做法：改为 `LLM` 作为决策核心，使用静态初始 plan 驱动 tool orchestration，runtime 退回最小保障层
- 优点：更符合 agent 形态，利于后续加入文档/文件类能力
- 代价：需要重做协议层、执行循环和输出契约
- 风险：如果 tool 契约不稳，`LLM` 会难以稳定收敛

## 5. Decision

- 当前推荐方案：`Option B`
- 选择理由：
  - `LLM` 应是 agent 的大脑，而不是 runtime
  - runtime 不应理解真实世界，只应保证系统不失控
  - 先让 tool 稳定，再由 `LLM` 组合，比继续堆固定 workflow 更适合当前升级方向
- 暂不采用什么：
  - 不继续沿旧 `phase-driven` 路线扩展新任务模块
  - 不开放 raw DOM 原子动作给 `LLM`

## 6. Impact

- 影响哪些模块：
  - `Runtime`
  - `Tools`
  - `Memory`
  - 输出协议
- 影响哪些文档：
  - `doc/spec.md`
  - `doc/constraints.md`
  - `doc/plan.md`
  - `doc/status.md`
  - `doc/acceptance.md`
  - `AGENTS.md`
- 是否需要新增验收项：
  - 需要，已补 `PlanStep`、`ToolResult`、runtime 最小护栏、最终输出结构等迁移验收项

## 7. Open Questions

- `PlanStep` 与 `ToolResult` 在代码中的最小字段定义如何落地
- 现有 6 个 tool 中哪些先保留为第一批 `runtime-visible tool`
- 新循环下 side panel 需要显示哪些最小状态

## 8. Next Actions

1. 在 `src/shared/types.ts` 中定义 `PlanStep` 与 `ToolResult`
2. 将 `Runtime` 改为最小 plan 执行器 + 护栏层
3. 迁移 `commerce_search`，再迁移 `public_research`

## 9. Handoff

- 当前结论：
  - `LLM` 是决策核心
  - `Runtime` 是最小保障层
  - 当前采用静态初始 plan，不做复杂 plan 改写
  - 先把 tool 封装可用，再让 `LLM` 组合
- 尚未定稿的部分：
  - 类型协议的精确定义
  - 代码迁移细节
- 新线程接手时先验证什么：
  - `PlanStep / ToolResult` 契约能否支撑 `commerce_search` 最小闭环

Updated: 2026-04-03
