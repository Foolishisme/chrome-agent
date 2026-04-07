# Browser Agent MVP 验收清单

## 1. 状态定义

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

说明：

- 本文同时覆盖基础回归与当前 v1 架构收口验收
- 未执行项保持 `NOT_RUN`
- 用户口头或真实环境反馈会在备注中标明 `user-reported`

## 2. 基础回归

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm.cmd run build` | PASS | 2026-04-07 已验证 |
| B2 | 自动化测试通过 | `npm.cmd test` | PASS | 2026-04-07 已验证，60 tests |
| B3 | `commerce_search` 单测基线通过 | `tests/runtime-tools.test.ts` | PASS | canonical tool 断言已更新 |
| B4 | `public_research` 单测基线通过 | `tests/public-research.test.ts` | PASS | canonical tool 断言已更新 |

## 3. v1 架构收口验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| N1 | `PlanStep` 契约已收口 | 检查 `src/shared/types.ts` | PASS | 已固定 `stepId / goal / allowedTools / successCriteria / status` |
| N2 | 高层 `ToolResult` 契约已统一 | 检查 `src/shared/types.ts` 与 `src/background/tools/` | PASS | 已固定 `status / summary / outputs / artifacts / facts / stepStatus / retryHint / terminal` |
| N3 | `ActionResult` 与高层 `ToolResult` 已分离 | 检查 `src/shared/types.ts` / `src/shared/schema.ts` | PASS | 内容脚本回包不再冒充高层 tool 结果 |
| N4 | 旧 alias tool 已退出主链 | 检查 `src/shared/types.ts` / `src/background/tools/registry.ts` | PASS | 只保留 canonical tool |
| N5 | Runtime 不再按 `phase -> tool` 调度 | 检查 `src/background/runtime-core.ts` | PASS | 已改为 plan loop |
| N6 | 单工具 step 不调用 LLM | `tests/runtime.test.ts` | PASS | 已覆盖 |
| N7 | 多工具 step 非法选 tool 会被拒绝 | `tests/runtime.test.ts` | PASS | 已覆盖 |
| N8 | 同一 tool 连续 `retryable_error` 3 次后停止 | `tests/runtime.test.ts` | PASS | 已覆盖 |
| N9 | 连续 3 次无进展后停止 | `tests/runtime.test.ts` | PASS | 已覆盖 |
| N10 | stop / error 路径仍补结构化 `FinalResult` | 检查 `src/background/runtime-core.ts` | PASS | 已统一走 fallback final result |
| N11 | `currentPhase` 已退出主链 | 检查 `src/shared/types.ts` / `src/background/runtime-core.ts` / `src/sidepanel/index.ts` | PASS | 已移除主链依赖 |
| N12 | Side Panel 已对齐新结果协议 | 检查 `src/sidepanel/index.ts` | PASS | 读取 `finalResult.markdown / status / errorsOrBlockers / suggestedNextAction` |

## 4. 模块主链验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| M1 | `commerce_search` 主链为 canonical 4 步 | 检查 `src/background/query-compiler.ts` | PASS | `compileTaskSpec -> openSearchResults -> collectCommerceCandidates -> finalizeCommerceResult` |
| M2 | `public_research` 主链为 canonical 5 步 | 检查 `src/background/query-compiler.ts` | PASS | `compileTaskSpec -> openSearchResults -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult` |
| M3 | `readResearchSourceFacts` 可重复执行直到目标或耗尽 | `tests/public-research.test.ts` | PASS | 已覆盖 |
| M4 | `collectCommerceCandidates` 内部处理 scroll recovery | `tests/runtime-tools.test.ts` | PASS | 已覆盖 |

## 5. 真机与联调验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| L1 | 扩展可加载到 Chrome | 加载 `dist/` | PASS | user-reported |
| L2 | Side Panel 可启动 session | Chrome 手动验证 | PASS | user-reported |
| L3 | `public_research` 真机闭环可完成 | 手动输入调研目标并完成输出 | PASS | user-reported |
| L4 | `commerce_search` 真机闭环可完成 | 手动输入购物目标并完成输出 | NOT_RUN | 本轮未记录 |
| L5 | stop / error / budget 护栏在 UI 中可见 | 真机制造对应路径 | NOT_RUN | 代码已落地，未专门手测 |
| L6 | Gemini live request 可用 | 配置 key 后验证 | NOT_RUN | 本轮未做 |
| L7 | DeepSeek live request 可用 | 配置 key 后验证 | NOT_RUN | 本轮未做 |

## 6. 当前剩余风险

1. `commerce_search` 缺真机闭环记录。
2. stop / error / budget guardrails 缺真机可视化记录。
3. `artifacts` 协议已固定，但真实文件 artifact 仍未进入主链。

## 7. 推荐验收顺序

1. `B1`
2. `B2`
3. `B3 / B4`
4. `N1 - N12`
5. `M1 - M4`
6. `L1 - L7`

Updated: 2026-04-07
