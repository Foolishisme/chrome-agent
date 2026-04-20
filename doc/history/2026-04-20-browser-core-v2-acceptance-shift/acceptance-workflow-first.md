# Browser Agent 验收清单

## 1. 状态定义

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

说明：

- 本文只记录验收项、验证方式、当前状态和必要备注。
- 风险清单放在 `doc/status.md`。
- 执行过程和验证流水放在 `doc/logs/exec.md`。
- 历史验收补丁放在 `doc/history/`。

## 2. 基础回归

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm.cmd run build` | PASS | 2026-04-16 已验证 |
| B2 | 自动化测试通过 | `npm.cmd test` 或相关最小测试集 | PASS | 最近完整记录为 84 tests；最新专项为 38 tests |
| B3 | schema / runtime / tool 基线可验证 | 相关单测 | PASS | canonical tool 与结果协议已有覆盖 |

## 3. 架构收口

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| A1 | `LLM plan-driven tool orchestration` 成为主执行范式 | 检查 `src/background/runtime-core.ts` | PASS | runtime 不再按旧 phase 推进 |
| A2 | 单工具 step 不调用 LLM 选工具 | `tests/runtime.test.ts` | PASS | 已覆盖 |
| A3 | 多工具 step 只能选择 `allowedTools` 内工具 | `tests/runtime.test.ts` | PASS | 已覆盖非法选 tool |
| A4 | 重复失败与无进展会停止 | `tests/runtime.test.ts` | PASS | 已覆盖失败护栏 |
| A5 | stop / error / blocked 路径输出结构化最终结果 | 检查 runtime 与相关测试 | PASS | 仍缺真机可视化记录 |

## 4. 任务模块

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| T1 | `direct_answer` 可直接回答稳定问题和已有证据追问 | `tests/query-compiler.test.ts` / runtime tool 测试 | PASS | 已覆盖直接回答与搜索边界 |
| T2 | `commerce_search` 主链可完成商品搜索推荐 | `tests/runtime-tools.test.ts` / 真机手测 | PASS | 真机闭环为 `user-reported` |
| T3 | `public_research` 主链可完成多来源调研 | `tests/public-research.test.ts` / 真机手测 | PASS | 真机闭环为 `user-reported` |
| T4 | `site_overview` 可读取入口主页和一跳高价值页面 | `tests/site-overview.test.ts` | PASS | 尚缺 Chrome 真机样例 |
| T5 | research 来源事实脱水可生成结构化证据卡 | `tests/schema.test.ts` / `tests/llm-client.test.ts` / research 测试 | PASS | 真实 provider 样本仍需补充 |

## 5. Side Panel 交互

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| U1 | 初始态不展示空运行区和空结果区 | `tests/sidepanel.test.ts` | PASS | 已覆盖 |
| U2 | 主按钮按状态收口为开始、停止、再次运行 | `tests/sidepanel.test.ts` | PASS | 已覆盖 |
| U3 | 最终正文只在会话流中展示一次 | `tests/sidepanel.test.ts` | PASS | 避免结果区重复正文 |
| U4 | 搜索偏好开关会传入 runtime，但不直接决定路由 | `tests/query-compiler.test.ts` / `tests/sidepanel.test.ts` | PASS | 已覆盖边界问题 |
| U5 | 失败或阻塞时 runtime 状态区可见 | `tests/sidepanel.test.ts` / 真机手测 | PARTIAL | 单测覆盖，真机样本不足 |

## 6. 真机与联调

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| L1 | 扩展可加载到 Chrome | 加载 `dist/` | PASS | `user-reported` |
| L2 | Side Panel 可启动 session | Chrome 手动验证 | PASS | `user-reported` |
| L3 | stop / error / budget 护栏在 UI 中可见 | Chrome 手动制造路径 | NOT_RUN | 下一步优先 |
| L4 | Gemini live request 可用 | 配置 key 后验证 | NOT_RUN | 待联调 |
| L5 | DeepSeek live request 可用 | 配置 key 后验证 | NOT_RUN | 待联调 |
| L6 | 自动化方式可附着项目扩展并驱动真机会话 | Playwright / Chrome 附着 | NOT_RUN | 当前仍是 blocker |

Updated: 2026-04-17
