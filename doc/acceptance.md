# Browser Agent MVP 验收清单

## 1. 文档定位

本文档只定义：

- 当前验收项
- 验证方式
- 当前状态

状态定义：

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

说明：

- 本文件现在同时覆盖“旧链路回归基线”与“新架构迁移验收”
- 旧链路 `PASS` 不等于新架构已经 `PASS`

## 2. 旧链路回归基线

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm.cmd run build` | PASS | 旧链路基线可构建 |
| B2 | 自动化测试通过 | `npm.cmd test` | PASS | 旧链路基线测试通过 |
| B3 | `commerce_search` 旧链路回归可通过 | `tests/scanner.test.ts` + `tests/runtime-tools.test.ts` | PASS | 旧架构回归基线 |
| B4 | `public_research` 旧链路回归可通过 | `tests/public-research.test.ts` | PASS | 旧架构回归基线 |

## 3. 新架构迁移验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| N1 | `PlanStep` 契约已落地 | 检查 `src/shared/types.ts` | PASS | 已包含 `stepId/goal/allowedTools/successCriteria/status` |
| N2 | `ToolResult` 契约已落地 | 检查 `src/shared/types.ts` 与 `src/background/tools.ts` | PASS | 已包含 `status/summary/outputs/artifacts/facts/errorCode/retryHint` |
| N3 | Runtime 不再按 `phase -> tool` 硬编码调度 | 检查 `src/background/runtime.ts` | PASS | 已改为基于 plan step 与 `allowedTools` 选择 tool |
| N4 | LLM 只能在 `allowedTools` 中选择下一步 tool | 单测或集成测试验证 | PARTIAL | 当前 runtime 已按 `allowedTools` 限制选 tool，但尚未接入真实 LLM 选 tool |
| N5 | Runtime 软预算提醒已落地 | 单测验证 `softStepLimit = 15` 时暴露 `budget_low` | NOT_RUN | 到达 15 步时必须提醒 LLM 收敛 |
| N6 | Runtime 硬预算已落地 | 单测验证 `maxTotalSteps = 20` 与 `maxElapsedMs = 180000` | NOT_RUN | 到达硬上限时必须强制停止 |
| N7 | Runtime 重试与无进展护栏已落地 | 单测验证同 tool `3` 次失败停止、连续 `3` 步无进展停止 | NOT_RUN | 不允许无限盲试 |
| N8 | 系统始终产出结构化最终输出 | 单测或集成测试验证 `success/partial/failed/blocked` | NOT_RUN | 失败时也必须有结构化输出 |
| N9 | `commerce_search` 已迁移到新循环 | 集成测试或真机验证 | NOT_RUN | 不再依赖旧 `phase-driven` 主循环 |
| N10 | `public_research` 已迁移到新循环 | 集成测试或真机验证 | NOT_RUN | 不再依赖旧 `phase-driven` 主循环 |

## 4. 真机与联调验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| M1 | 扩展可加载到 Chrome | 加载 `dist/` 目录 | NOT_RUN | 本轮未手动复验 |
| M2 | Side Panel 可启动 session | Chrome 手动验证 | NOT_RUN | 本轮未手动复验 |
| M3 | `commerce_search` 新架构闭环可完成 | 真机输入购物目标并完成推荐输出 | NOT_RUN | 需在新循环下验证 |
| M4 | `public_research` 新架构闭环可完成 | 真机输入调研目标并完成调研输出 | NOT_RUN | 需在新循环下验证 |
| M5 | 预算护栏可见且 session 不崩溃 | 真机制造长链路或无进展路径验证 | NOT_RUN | 需验证 `budget_low`、硬停止和 UI 表现 |
| M6 | 最终输出始终可见 | 真机分别制造 `success/partial/blocked` 路径验证 | NOT_RUN | 失败时也要能看到结构化输出 |
| M7 | Gemini live request 可用 | 配置 key 后真机验证 | NOT_RUN | 未做真实请求验证 |
| M8 | DeepSeek live request 可用 | 配置 key 后真机验证 | NOT_RUN | 未做真实请求验证 |

## 5. 当前阻塞项

当前阻塞新架构 MVP 的主要项是：

1. `N4` 真实 LLM 选 tool 仍未接入，当前仅以 runtime 的 `allowedTools` 约束保证不会越权
2. `N5 / N6 / N7 / N8` runtime 最小护栏与结构化最终输出的完整新循环验收尚未完成
3. `N9 / N10` 两个已跑通模块虽已接入 plan-step 驱动调度，但尚未完成新循环集成验收
4. `M1 / M2 / M3 / M4 / M5 / M6` 新架构下的真机入口、闭环、预算与最终输出尚未验证
5. `M7 / M8` provider live request 尚未确认

说明：

- 旧链路回归基线已通过，不等于新架构迁移已通过
- 对未执行的新架构项，本文件保持 `NOT_RUN`

## 6. 推荐验收顺序

建议每次迭代按以下顺序验证：

1. `B1`
2. `B2`
3. `B3 / B4`
4. `N1 / N2`
5. `N3 / N4`
6. `N5 / N6 / N7`
7. `N8`
8. `N9 / N10`
9. `M1 / M2`
10. `M3 / M4 / M5 / M6`
11. `M7 / M8`

## 7. 更新规则

- 验收结果变化时，必须更新本文件
- 未验证的项不要写成 `PASS`
- 如果验收项本身变化，应同步更新 `spec.md`

Updated: 2026-04-03
