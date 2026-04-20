# Browser Agent 验收清单

## 1. 文档定位

本文只记录当前主线的验收目标、验证方式、当前状态和必要备注。

当前主线已经切到：

`LLM-driven bounded plan + thin runner over Store-safe Browser Core V2`

旧 `direct_answer / commerce_search / public_research / site_overview` 不再作为新主线验收目标；它们保留为回归、对照、fallback 或 harness。

旧 workflow-first 验收清单已归档到：

- `doc/history/2026-04-20-browser-core-v2-acceptance-shift/acceptance-workflow-first.md`

风险清单放在 `doc/status.md`。执行过程和验证流水放在 `doc/logs/exec.md`。

## 2. 状态定义

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

## 3. 当前验收分层

| 编号 | 场景 | 定位 | 状态 | 备注 |
|---|---|---|---|---|
| S0 | 直答不误触浏览器 | 回归基线，验证明确可直接回答的问题不会强制启动 browser tool | PASS | 旧 query/runtime/sidepanel 单测已有覆盖，后续保持回归 |
| S1 | explicit URL overview | 当前第一主验收，验证 bounded plan runner + Browser Core V2 + StoreSafeDriver 独立读页、裁剪、结构化总结 | NOT_RUN | ToolRegistry metadata、runner、StoreSafeDriver chrome wiring 尚未完成 |
| S2 | explicit URL + 一跳读取 | 下一步主验收，基于 links/controls 选择少量高价值链接继续读 | NOT_RUN | 依赖 S1、受限 action 数、受限并发和读取预算 |
| S3 | 开放问题浏览调研 | 后续验收，用户不给 URL 时搜索、打开候选、读多页、汇总 | NOT_RUN | 不复用旧 `public_research` 作为产品边界 |
| S4 | 低风险页面操作 | 后续验收，搜索框输入、点击链接、展开菜单、滚动、普通草稿填写 | NOT_RUN | 必须接 action risk gate |
| S5 | advanced / CDP driver | 高级、本地或企业验收，不是大众商店默认路径 | NOT_RUN | Store-safe 主链通过后再实现 |

## 4. S0 - 直答回归

目标：

- 明确可直接回答的问题不启动浏览器会话。
- 搜索偏好或浏览器能力存在时，不强制把所有问题路由到浏览器。
- 最终结果仍走统一 turn 输出，不重复渲染正文。

推荐样例：

| 输入 | 期望 |
|---|---|
| `1+1 等于几？` | 直接回答，不调用 browser tool |
| `用一句话解释什么是 DOM` | 可直接回答，不启动浏览器 |
| `基于上面结果再总结一句` | 使用已有上下文，不重新开浏览器 |

验证方式：

- `tests/query-compiler.test.ts`
- `tests/runtime.test.ts`
- `tests/sidepanel.test.ts`

当前状态：`PASS`。

## 5. S1 - explicit URL overview

目标：

- 输入明确 URL。
- LLM 或测试夹具生成一轮 1-5 个 action 的 bounded plan。
- Thin runner 校验 plan schema、工具白名单、ToolRegistry metadata、输出引用、预算和失败策略。
- Browser Core V2 使用 store-safe driver 打开、导航、观察页面。
- 页面内容进入 LLM 前经过 Readability/Turndown、裁剪、脱水或结构化。
- LLM 基于 observation 决定读取、停止或汇总。
- 最终结果表达 `success / partial / failed / blocked`。
- 输出包含页面标题、URL、主要内容摘要、关键链接、已覆盖范围、未覆盖范围和失败原因。
- 不走旧 `compileTaskSpec -> PlanStep -> allowedTools -> finalize*` 主链。
- 不引入重型 DAG / LangGraph / Temporal 式 runtime。
- 不依赖 `debugger` / CDP。

推荐样例：

| 输入 | 期望 |
|---|---|
| `总结 https://example.com 这个页面，它主要讲什么？有哪些关键链接？哪些内容你没有覆盖？` | 打开页面、观察、裁剪、结构化总结，说明覆盖边界 |
| `读取这个明确 URL，告诉我页面标题、正文主旨和可继续阅读的链接` | 返回来源明确的 page overview 和 links/controls 摘要 |

验证方式：

- `tests/browser-core-v2/readable-content.test.ts`
- `tests/browser-core-v2/dom-snapshot.test.ts`
- `tests/browser-core-v2/browser-tool-schema.test.ts`
- 后续补充 bounded plan schema / runner mock 单测。
- 后续补充 ToolRegistry metadata 单测。
- 后续补充 `StoreSafeDriver` chrome API 单测或 mock 集成测试。
- 后续补充 Chrome 真机扩展手测记录。

当前状态：`NOT_RUN`。

阻塞：

- `StoreSafeDriver` 尚未接入真实 `chrome.tabs / chrome.scripting`。
- ToolRegistry metadata 尚未落地。
- Bounded plan runner 尚未落地。
- Agent Loop V2 minimal 尚未落地。

## 6. S2 - explicit URL + 一跳读取

目标：

- 在 S1 的页面观察基础上，抽取 links/controls。
- LLM 在 bounded plan 中只选择少量高价值一跳链接继续读取。
- runner 限制 action 数、并发数和失败策略；工具内部处理导航等待、失败、裁剪和 partial success。
- 最终结果区分已读页面、跳过页面、失败页面和未覆盖区域。

验证方式：

- Browser Core V2 links/controls 单测。
- explicit URL overview harness 集成测试。
- Chrome 真机样例。

当前状态：`NOT_RUN`。

## 7. S3 - 开放问题浏览调研

目标：

- 用户只给目标，不给 URL。
- Agent 可以搜索、打开候选页面、读取多页、比较证据并汇总。
- 旧 `public_research` 可作为对照或 fallback，但不作为新产品边界。
- 结果必须说明来源、覆盖范围、置信边界和失败项。

验证方式：

- Browser tool-loop 集成测试。
- 多页面 result trimming 与 SourceFactCard 验证。
- provider live request 样本。

当前状态：`NOT_RUN`。

## 8. S4 - 低风险页面操作

目标：

- 支持搜索框输入、展开菜单、打开链接、滚动和普通草稿填写。
- 每次动作前后重新 observe。
- action risk gate 阻止或确认高风险动作。
- 下单、支付、删除、发送不可撤回内容等默认 `blocked` 或要求用户确认。

验证方式：

- content interaction primitive 单测。
- action risk policy 单测。
- Chrome 真机低风险页面操作样例。

当前状态：`NOT_RUN`。

## 9. S5 - advanced / CDP driver

目标：

- `CdpDriver` 只作为 advanced/local/enterprise driver。
- Store-safe 主链不依赖 `debugger`。
- CDP 路径必须配套权限说明、运行状态、stop/takeover 和高风险确认。

验证方式：

- CdpDriver 单测和本地真机样例。
- 与 StoreSafeDriver 的同任务对照。

当前状态：`NOT_RUN`。

## 10. 基础回归

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm.cmd run build` | PASS | 最近记录见 `doc/status.md` |
| B2 | Browser Core V2 最小单测通过 | `npm.cmd test -- tests/browser-capability.test.ts tests/browser-core-v2/readable-content.test.ts tests/browser-core-v2/dom-snapshot.test.ts tests/browser-core-v2/browser-tool-schema.test.ts` | PASS | 最近记录为 4 个测试文件、12 个测试 |
| B3 | browser tool schema 拒绝 raw 高危能力 | `tests/browser-core-v2/browser-tool-schema.test.ts` | PASS | `debugger`、`cdp`、raw `evaluate` 不暴露 |
| B4 | 旧 workflow 回归不破坏现有 UI/provider 基线 | 相关旧单测或最小测试集 | PARTIAL | 旧模块不再是新主验收，但仍需避免无意破坏 |
| B5 | bounded plan runner 基础行为 | 后续 runner mock 单测 | NOT_RUN | 需覆盖 action 上限、工具白名单、schema 校验、依赖跳过、partial success、串并行调度 |

## 11. 真机与联调

| 编号 | 验收项 | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| L1 | 扩展可加载到 Chrome | 加载 `dist/` | PASS | 旧记录为 `user-reported` |
| L2 | Side Panel 可启动 session | Chrome 手动验证 | PASS | 旧记录为 `user-reported` |
| L3 | StoreSafeDriver 可通过 `chrome.tabs / chrome.scripting` 驱动明确 URL | Chrome 手动验证 / 自动化附着 | NOT_RUN | S1 blocker |
| L4 | Browser Core V2 explicit URL overview 真机闭环 | Chrome 手动验证 / 自动化附着 | NOT_RUN | S1 主验收，应通过 bounded plan runner 路径 |
| L5 | stop / error / budget 护栏在 UI 中可见 | Chrome 手动制造路径 | NOT_RUN | 仍需真机样本 |
| L6 | provider live request 可用 | 配置 key 后验证 | NOT_RUN | Gemini / DeepSeek 均待联调 |

Updated: 2026-04-20
