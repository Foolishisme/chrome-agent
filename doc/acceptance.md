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
| B1 | 项目可构建 | `npm.cmd run build` | PASS | 2026-04-09 已验证 |
| B2 | 自动化测试通过 | `npm.cmd test` | PASS | 2026-04-09 已验证，84 tests |
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
| N15 | Side Panel 初始态不展示空的运行区与结果区 | `tests/sidepanel.test.ts` | PASS | 已覆盖首屏隐藏空区与输入框初始态 |
| N16 | Side Panel 主按钮按状态收口为 `开始 / 停止 / 再次运行` | `tests/sidepanel.test.ts` | PASS | 已覆盖初始态 `开始`、运行中 `停止`、完成后复用 `开始` |
| N17 | 时间线运行中默认展开，结果完成后自动折叠 | `tests/sidepanel.test.ts` | PASS | 已覆盖运行中显示 timeline、成功后回收到 turn 内 |
| N18 | 最终结果仍保持一次性交付，不引入 token 级流式协议 | 检查 `src/sidepanel/index.ts` / `src/shared/types.ts` | PASS | 当前仅做半流式前端呈现，未引入 token 级协议 |
| N19 | `direct_answer` 主链已收口为 canonical 2 步 | 检查 `src/shared/types.ts` / `src/background/query-compiler.ts` | PASS | 已固定为 `compileTaskSpec -> finalizeDirectAnswer` |
| N20 | 已搜索且证据充足的问题可直接回答，不再强制打开搜索页 | `tests/query-compiler.test.ts` / `tests/runtime-tools.test.ts` | PASS | 已支持 conversation 内追问复用已有证据 |
| N21 | 明显时效敏感或显式要求最新信息的问题不会仅凭内置知识直接回答 | `tests/query-compiler.test.ts` | PASS | 已覆盖“今天金价是多少”这类时效敏感问题 |
| N22 | 搜索判断显式接收当前绝对时间、用户时区和近期证据获取时间 | 检查 `src/background/prompting.ts` / `src/background/query-compiler.ts` / `src/background/runtime-core.ts` | PASS | 已显式注入 `currentTimeIso / timezone / conversationTurns.savedAt` |
| N23 | 输入框可切换 `智能回答 / 优先搜索` 偏好，且该偏好会作为启动参数传入 runtime | `tests/sidepanel.test.ts` | PASS | 已覆盖放大镜开关与 `START_SESSION.searchPreference` |
| N24 | `prefer_search` 只影响边界问题，不覆盖明确可直接回答的问题 | `tests/query-compiler.test.ts` | PASS | 已覆盖“解释一下事件循环是什么”仍走 `direct_answer` |
| N25 | optimistic startup 期间仍提供显式 `停止` 入口，而不是只显示禁用的开始按钮 | `tests/sidepanel.test.ts` | PASS | 已覆盖 pending 启动可取消 |
| N26 | 运行中在 Draft 输入框按普通 `Enter` 不会误触发 `STOP_SESSION` | `tests/sidepanel.test.ts` | PASS | 已覆盖运行中输入仍可编辑但不会变成隐藏中断热键 |
| N27 | runtime 状态区只在明确失败/阻塞时展示；用户停止和 tool 内部瞬时重试不展示该区 | `tests/sidepanel.test.ts` | PASS | 已覆盖 failed 显示、stopped 与 transient error 不显示 |

## 4. 模块主链验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| M1 | `commerce_search` 主链为 canonical 4 步 | 检查 `src/background/query-compiler.ts` | PASS | `compileTaskSpec -> openSearchResults -> collectCommerceCandidates -> finalizeCommerceResult` |
| M2 | `public_research` 主链为 canonical 5 步 | 检查 `src/background/query-compiler.ts` | PASS | `compileTaskSpec -> openSearchResults -> collectResearchCandidates -> readResearchSourceFacts -> finalizeResearchResult` |
| M3 | `readResearchSourceFacts` 可重复执行直到目标或耗尽 | `tests/public-research.test.ts` | PASS | 已覆盖 |
| M4 | `collectCommerceCandidates` 内部处理 scroll recovery | `tests/runtime-tools.test.ts` | PASS | 已覆盖 |
| M5 | `collectResearchCandidates` 内部处理第一页提取、过滤与重排序 | `tests/public-research.test.ts` / `tests/research-search-quality.test.ts` | PASS | 已覆盖 |
| M6 | `direct_answer` 主链为 canonical 2 步 | 检查 `src/background/query-compiler.ts` / `tests/query-compiler.test.ts` | PASS | `compileTaskSpec -> finalizeDirectAnswer` |

## 5. 真机与联调验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| L1 | 扩展可加载到 Chrome | 加载 `dist/` | PASS | user-reported |
| L2 | Side Panel 可启动 session | Chrome 手动验证 | PASS | user-reported |
| L3 | `public_research` 真机闭环可完成 | 手动输入调研目标并完成输出 | PASS | user-reported |
| L4 | `commerce_search` 真机闭环可完成 | 手动输入购物目标并完成输出 | PASS | user-reported |
| L5 | stop / error / budget 护栏在 UI 中可见，且 runtime 区只在明确失败/阻塞时展开 | 真机制造对应路径 | NOT_RUN | 单测已覆盖展示边界，真机表现仍未专门手测 |
| L6 | Gemini live request 可用 | 配置 key 后验证 | NOT_RUN | 本轮未做 |
| L7 | DeepSeek live request 可用 | 配置 key 后验证 | NOT_RUN | 本轮未做 |
| L8 | 自动化方式可附着项目扩展并驱动真机会话 | 现有浏览器附着 / 新拉起 Chrome + 扩展 | NOT_RUN | 本轮尝试未稳定拿到项目扩展上下文，仍是 blocker |

## 6. 当前剩余风险

1. stop / error / budget guardrails 缺真机可视化记录。
2. provider live request 仍缺真实环境验证。
3. research 第一页重排序虽已落地，但缺少命中率量化记录。
4. 自动化真机扩展会话验证仍未打通。
5. `direct_answer / prefer_search` 已落地，但仍缺真机连续追问样本与误判样本记录。

## 7. 推荐验收顺序

1. `B1`
2. `B2`
3. `B3 / B4 / B5`
4. `N1 - N24`
5. `M1 - M6`
6. `L1 - L8`

## 8. 下一阶段预备验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| G1 | 顶层路由可一次性输出 `direct_answer / commerce_search / site_overview / multi_source_overview`，而不是先判“是否调研”再二次判 mode | `tests/query-compiler.test.ts` | NOT_RUN | 当前已支持 `direct_answer / commerce_search / public_research`，后续继续收口 |
| G2 | `site_overview` MVP 可读取主页与前 `N` 个高价值页面并输出概况 | `tests/site-overview.test.ts` / 真机手测 | NOT_RUN | 下一阶段主目标 |
| G3 | `site_overview` 结果会明确标注读取范围、覆盖边界与未覆盖区域 | `tests/sidepanel.test.ts` / 结果样例检查 | NOT_RUN | 不允许把概况型结果伪装成精确确认 |
| G4 | 通用调研方向下，文档附件跟进、下载与解析仍保留在读取 tool 内部，不新增独立 `download` runtime-visible tool | 检查 `src/background/tools/` / `src/shared/types.ts` | NOT_RUN | 当前设计约束 |
| G5 | `site_overview` 只在主页与一跳站内高价值页面范围内工作，不做深层递归 | `tests/site-overview.test.ts` | NOT_RUN | MVP 范围约束 |
| G6 | `site_overview` 达到 `pageReadLimit`、候选耗尽或入口受阻时会停止，并返回正确的 `success / partial / blocked / failed` | `tests/site-overview.test.ts` / 真机手测 | NOT_RUN | 对齐已拍板 stop condition |
| G7 | `site_overview` 的入口解析可复用：显式 `URL` 优先直达、无效时只做一次有界修复、未提供 `URL` 时才解析官网入口 | `tests/site-overview.test.ts` / 真机手测 | NOT_RUN | 不把第一步写死成固定搜索 |

Updated: 2026-04-10

## 9. 2026-04-13 `site_overview` 验收补充

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| S1 | URL 或官网产品/平台/文档/价格意图可路由到 `site_overview` | `tests/query-compiler.test.ts` | PASS | 已覆盖显式 URL 与 `OpenAI 的产品` |
| S2 | 口碑、新闻、竞品、市场观点仍走 `public_research` | `tests/query-compiler.test.ts` | PASS | 已覆盖多源意图反例 |
| S3 | `resolveEntryPoint` 进入 canonical tool 集合 | `tests/schema.test.ts` / `npm.cmd run build` | PASS | 已更新 schema 与 registry |
| S4 | 内容脚本可返回站内导航候选 | `tests/schema.test.ts` / `tests/site-overview.test.ts` | PASS | 新增 `EXTRACT_SITE_NAV_LINKS` |
| S5 | 站内候选先规则过滤/打分，再允许 LLM 有界重排 | `tests/site-overview.test.ts` / `tests/llm-client.test.ts` | PASS | 已覆盖成功重排与规则回退 |
| S6 | 次页正文少于 200 字时读取替补候选 | `tests/site-overview.test.ts` | PASS | 不计入成功来源 |
| S7 | 次页疑似 404 时读取替补候选 | `tests/site-overview.test.ts` | PASS | 不计入成功来源 |
| S8 | 候选耗尽但来源不足时返回部分结果边界 | `tests/site-overview.test.ts` | PASS | 记录 unresolved issue |
| S9 | 项目可构建 | `npm.cmd run build` | PASS | 2026-04-13 已验证 |

Updated: 2026-04-13
