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
| B2 | 自动化测试通过 | `npm.cmd test` | PASS | 2026-04-07 已验证，71 tests |
| B3 | `commerce_search` 单测基线通过 | `tests/runtime-tools.test.ts` | PASS | canonical tool 断言已更新 |
| B4 | `public_research` 单测基线通过 | `tests/public-research.test.ts` | PASS | canonical tool 断言已更新 |
| B5 | research 搜索候选重排与信息提取专项测试通过 | `tests/research-search-quality.test.ts` | PASS | 5 个专项测试通过 |

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
| N12 | Side Panel 已对齐新结果协议 | 检查 `src/sidepanel/index.ts` | PASS | 结果区只展示最终交付物，运行细节回收到 runtime 区 |
| N13 | 最终输出已收口为 `inline | artifact` | 检查 `src/shared/types.ts` / `src/background/tools/helpers.ts` | PASS | 默认 `inline`，仅显式文档请求才生成 markdown artifact |
| N14 | research 候选重排序有严格回退 | `tests/llm-client.test.ts` | PASS | 非法重排会回退到过滤后原顺序 |
| N15 | Side Panel 初始态不展示空的运行区与结果区 | `tests/sidepanel.test.ts` | NOT_RUN | 本轮拍板，待实现 |
| N16 | Side Panel 主按钮按状态收口为 `开始 / 停止 / 再次运行` | `tests/sidepanel.test.ts` | NOT_RUN | 初始态不再直接展示 `重试` |
| N17 | 时间线运行中默认展开，结果完成后自动折叠 | `tests/sidepanel.test.ts` | NOT_RUN | 作为“执行过程”轻量呈现，不改最终结果协议 |
| N18 | 最终结果仍保持一次性交付，不引入 token 级流式协议 | 检查 `src/sidepanel/index.ts` / `src/shared/types.ts` | NOT_RUN | 当前决策是先不做真正流式输出 |
| N19 | `direct_answer` 主链已收口为 canonical 2 步 | 检查 `src/shared/types.ts` / `src/background/query-compiler.ts` | PASS | 已固定为 `compileTaskSpec -> finalizeDirectAnswer` |
| N20 | 已搜索且证据充足的问题可直接回答，不再强制打开搜索页 | `tests/query-compiler.test.ts` / `tests/runtime-tools.test.ts` | PASS | 已支持 conversation 内追问复用已有证据 |
| N21 | 明显时效敏感或显式要求最新信息的问题不会仅凭内置知识直接回答 | `tests/query-compiler.test.ts` | PASS | 已覆盖“今天金价是多少”这类时效敏感问题 |
| N22 | 搜索判断显式接收当前绝对时间、用户时区和近期证据获取时间 | 检查 `src/background/prompting.ts` / `src/background/query-compiler.ts` / `src/background/runtime-core.ts` | PASS | 已显式注入 `currentTimeIso / timezone / conversationTurns.savedAt` |

## 4. 模块主链验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| M1 | `commerce_search` 主链为 canonical 4 步 | 检查 `src/background/query-compiler.ts` | PASS | `compileTaskSpec -> openSearchResults -> collectCommerceCandidates -> finalizeCommerceResult` |
| M2 | `public_research` 主链为 canonical 5 步 | 检查 `src/background/query-compiler.ts` | PASS | `compileTaskSpec -> openSearchResults -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult` |
| M3 | `readResearchSourceFacts` 可重复执行直到目标或耗尽 | `tests/public-research.test.ts` | PASS | 已覆盖 |
| M4 | `collectCommerceCandidates` 内部处理 scroll recovery | `tests/runtime-tools.test.ts` | PASS | 已覆盖 |
| M5 | `collectResearchCandidates` 内部处理第一页提取、过滤与重排序 | `tests/public-research.test.ts` / `tests/research-search-quality.test.ts` | PASS | 已覆盖 |

## 5. 真机与联调验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| L1 | 扩展可加载到 Chrome | 加载 `dist/` | PASS | user-reported |
| L2 | Side Panel 可启动 session | Chrome 手动验证 | PASS | user-reported |
| L3 | `public_research` 真机闭环可完成 | 手动输入调研目标并完成输出 | PASS | user-reported |
| L4 | `commerce_search` 真机闭环可完成 | 手动输入购物目标并完成输出 | PASS | user-reported |
| L5 | stop / error / budget 护栏在 UI 中可见 | 真机制造对应路径 | NOT_RUN | 代码已落地，未专门手测 |
| L6 | Gemini live request 可用 | 配置 key 后验证 | NOT_RUN | 本轮未做 |
| L7 | DeepSeek live request 可用 | 配置 key 后验证 | NOT_RUN | 本轮未做 |
| L8 | 自动化方式可附着项目扩展并驱动真机会话 | 现有浏览器附着 / 新拉起 Chrome + 扩展 | NOT_RUN | 本轮尝试未稳定拿到项目扩展上下文，仍是 blocker |

## 6. 当前剩余风险

1. stop / error / budget guardrails 缺真机可视化记录。
2. provider live request 仍缺真实环境验证。
3. research 第一页重排序虽已落地，但缺少命中率量化记录。
4. 自动化真机扩展会话验证仍未打通。
5. Side Panel 交互收口 v1 尚未实现，当前首屏与按钮语义仍偏 MVP。

## 7. 推荐验收顺序

1. `B1`
2. `B2`
3. `B3 / B4 / B5`
4. `N1 - N14`
5. `M1 - M5`
6. `L1 - L8`

Updated: 2026-04-07
