# Browser Agent MVP 验收清单

## 1. 状态定义

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

说明：

- 本文同时覆盖旧链路回归基线与新范式迁移验收
- 未执行的项保持 `NOT_RUN`
- 用户口头确认的实机结果会在备注里标明 `user-reported`

## 2. 旧链路回归基线

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm.cmd run build` | PASS | 2026-04-03 已验证 |
| B2 | 自动化测试通过 | `npm.cmd test` | PASS | 2026-04-03 已验证，47 tests |
| B3 | `commerce_search` 旧能力未被破坏 | `tests/runtime-tools.test.ts` | PASS | 单测通过 |
| B4 | `public_research` 旧能力未被破坏 | `tests/public-research.test.ts` | PASS | 单测通过 |

## 3. 新范式迁移验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| N1 | `PlanStep` 契约已落地 | 检查 `src/shared/types.ts` | PASS | 已包含 `stepId / goal / allowedTools / successCriteria / status` |
| N2 | 高层 tool 返回契约已完全统一 | 检查 `src/background/tools.ts` 与共享类型 | PARTIAL | 运行链路已统一为高层 tool 返回结果，但最终 `ToolResult` 协议仍在过渡态 |
| N3 | Runtime 不再按 `phase -> tool` 硬编码调度 | 检查 `src/background/runtime.ts` | PASS | 已改为按 `PlanStep.allowedTools` 选 tool |
| N4 | LLM 只能在 `allowedTools` 内选 tool | `tests/llm-client.test.ts` | PASS | 失败时回退到第一个 allowed tool，runtime 也会二次校验 |
| N5 | Runtime 软护栏已落地 | `tests/runtime.test.ts` | PASS | 已验证 soft step / soft elapsed 会暴露 `budgetLow` |
| N6 | Runtime 硬护栏已落地 | `tests/runtime.test.ts` | PASS | 已验证 `maxElapsedMs`；`maxTotalSteps` 逻辑已在 runtime 中落地 |
| N7 | Runtime 连续失败 / 无进展护栏已落地 | 检查 runtime 与单测 | NOT_RUN | 本轮未做 |
| N8 | 异常或中止时仍有结构化最终结果 | 检查 `src/background/runtime.ts` | PARTIAL | 代码已补终态结果兜底，但本轮未补专门单测 |
| N9 | `commerce_search` 已迁到新循环 | 单测 + 真机验证 | PARTIAL | 代码已运行在新 runtime，本线程未补 commerce 实机记录 |
| N10 | `public_research` 已迁到新循环 | 单测 + 真机验证 | PASS | 用户实机反馈通过，且当前代码运行在新 runtime |
| N11 | Side Panel 已同步新范式状态展示 | `npm.cmd run build` + 检查 `src/sidepanel/index.ts` | PASS | 已切到 `对话 | 运行状态 | 结果` |
| N12 | 执行时间线按计划步骤正序分组展示 | 检查 `src/sidepanel/index.ts` + `public/sidepanel.css` | PASS | 已按计划步骤折叠展示步骤细节，去掉旧的拼接式展示 |

## 4. 真机与联调验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| M1 | 扩展可加载到 Chrome | 加载 `dist/` | PASS | user-reported |
| M2 | Side Panel 可启动 session | Chrome 手动验证 | PASS | user-reported |
| M3 | `commerce_search` 真机闭环可完成 | 真机输入购物目标并完成推荐输出 | NOT_RUN | 本线程未记录 |
| M4 | `public_research` 真机闭环可完成 | 真机输入调研目标并完成调研输出 | PASS | user-reported |
| M5 | 步数/时间护栏在 UI 中可见 | 真机制造长链路或超时路径 | NOT_RUN | 代码已落地，未专门手动验证 |
| M6 | 异常中止时结果区仍可见结构化结果 | 真机验证 stop / error 路径 | NOT_RUN | 代码已落地，未专门手动验证 |
| M7 | Gemini live request 可用 | 配置 key 后真机验证 | NOT_RUN | 本轮未做 |
| M8 | DeepSeek live request 可用 | 配置 key 后真机验证 | NOT_RUN | 本轮未做 |

## 5. 当前主要剩余风险

1. 高层 tool 返回契约仍是过渡态，后续还要继续收口。
2. `currentPhase` 仍保留兼容用途，尚未完全退出内部实现。
3. `no progress` / 连续失败类护栏未补齐。
4. `commerce_search` 还缺本线程内的实机闭环记录。

## 6. 推荐验收顺序

1. `B1`
2. `B2`
3. `B3 / B4`
4. `N1 / N3 / N4`
5. `N5 / N6`
6. `N8 / N11 / N12`
7. `N9 / N10`
8. `M1 - M8`

Updated: 2026-04-03
