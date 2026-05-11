# Browser Agent 验收清单

## 1. 定位

本文记录当前 Browser Core V2 主路径的验收目标、验证方式和状态。

当前主路径：

`LLM-driven bounded plan + thin runner over Store-safe Browser Core V2`

当前 checkpoint：

- [doc/checkpoint.md](./checkpoint.md)

## 2. 状态标签

- `PASS`
- `PARTIAL`
- `FAIL`
- `PENDING`

## 3. 主验收分层

| ID | 场景 | 目的 | 状态 | 备注 |
|---|---|---|---|---|
| S0 | 直答路由 | 明确直答问题不触发 browser tool 执行 | PASS | query/runtime/sidepanel 测试覆盖 |
| S1 | explicit URL overview | 打开 URL、观察内容、裁剪证据，并带覆盖边界汇总 | PENDING | 需要通用 runner 路径和 `StoreSafeDriver` Chrome wiring |
| S2 | explicit URL plus one-hop read | 选择少量高价值链接继续读取并汇总覆盖范围 | PENDING | 依赖 S1、action 限制、读取预算和 partial success 语义 |
| S3 | open web research | 搜索、打开候选页、读多页、比较证据并汇总边界 | PENDING | 必须使用当前 Browser Core V2 tool loop 边界 |
| S4 | low-risk interaction | 搜索框输入、链接、菜单、滚动和普通草稿填写 | PENDING | 需要 action risk gate |
| S5 | advanced driver path | CDP/debugger 只用于 advanced/local/enterprise 场景 | PENDING | Store-safe 路径保持默认目标 |

## 4. S0 直答路由

目标：

- 明确可回答的问题不执行浏览器能力。
- 搜索偏好不强制稳定直答进入浏览器。
- 最终内容在对话流中只展示一次。

推荐检查：

- `tests/query-compiler.test.ts`
- `tests/runtime.test.ts`
- `tests/sidepanel.test.ts`

状态：`PASS`

## 5. S1 Explicit URL Overview

目标：

- 输入包含明确 URL。
- LLM 或 fixture 生成 1-5 个 action 的 bounded plan。
- Thin Runner 校验 schema、allowed tools、ToolRegistry metadata、依赖、预算和失败策略。
- Browser capability 打开、等待、观察、裁剪并结构化页面内容。
- 最终结果包含页面标题、URL、主要摘要、关键链接、覆盖范围、未覆盖范围和失败说明。
- 路径使用 store-safe browser capability，避开 CDP/debugger。

推荐检查：

- `tests/browser-core-v2/readable-content.test.ts`
- `tests/browser-core-v2/dom-snapshot.test.ts`
- `tests/browser-core-v2/browser-tool-schema.test.ts`
- runner schema 与 ToolRegistry metadata 测试
- Chrome 扩展真实机器 S1 记录

状态：`PENDING`

阻塞项：

- 通用 `RoundPlanSchema` runner
- `StoreSafeDriver` Chrome tabs/scripting wiring
- 真实 Chrome S1 证据

## 6. S2 Explicit URL Plus One-Hop Read

目标：

- 从第一页提取 links 和 controls。
- 选择少量高价值链接。
- 强制 action 数、并发和读取预算。
- 返回已读页面、跳过页面、失败页面和未覆盖范围。

状态：`PENDING`

## 7. S3 Open Web Research

目标：

- 用户未提供 URL 时从目标发起搜索。
- 打开候选页面。
- 比较证据并汇总置信边界。
- 返回来源、覆盖范围和失败项。

状态：`PENDING`

## 8. S4 Low-Risk Interaction

目标：

- 支持常见低风险浏览器交互。
- 每次 action 前后都 observe。
- 阻断或确认高风险 action。

状态：`PENDING`

## 9. S5 Advanced Driver Path

目标：

- CDP/debugger 只在显式 advanced/local/enterprise driver 选择下使用。
- advanced 路径配套权限、状态、stop/takeover 和确认规则。

状态：`PENDING`

## 10. 基础检查

| ID | 检查项 | 方法 | 状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm run build` | PASS | 最近记录见 `doc/checkpoint.md` |
| B2 | Browser Core 核心测试 | Browser Core V2 unit tests | PASS | 最近记录见 `doc/checkpoint.md` |
| B3 | Browser tool schema 阻断 raw 高风险能力 | `tests/browser-core-v2/browser-tool-schema.test.ts` | PASS | runtime-visible tools 不暴露 unrestricted evaluate |
| B4 | 有效源码根成立 | source-root inspection | PASS | 当前 roots 见 `doc/checkpoint.md` |
| B5 | Archive 与 run-log 职责分离 | `tests/session-archive.test.ts`、`tests/run-log-store.test.ts` | PASS | Archive 面向用户结果；run log 面向调试证据 |
| B6 | 通用 bounded runner 行为 | runner tests | PENDING | 需要覆盖 schema、依赖、partial success 和调度 |

## 11. 真实 Chrome 检查

| ID | 检查项 | 方法 | 状态 | 备注 |
|---|---|---|---|---|
| L1 | 扩展可加载 | 加载 `dist/` | PASS | user-reported record |
| L2 | Side Panel 可启动 session | Chrome manual check | PASS | user-reported record |
| L3 | Store-safe driver 可打开并观察 URL | Chrome manual 或 attached automation | PENDING | S1 blocker |
| L4 | Explicit URL overview 通过通用 runner 完成 | Chrome manual 或 attached automation | PENDING | S1 主验收 |
| L5 | Stop、error 和 budget guard 可见 | Chrome manual scenario | PENDING | 需要 UI 证据 |
| L6 | Provider live request 可用 | configured provider key | PENDING | Gemini / DeepSeek live check |

更新日期：2026-05-11
