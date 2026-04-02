# Browser Agent MVP 验收清单

## 1. 文档定位

本文件定义当前 MVP 的验收项、验证方法与当前状态。

状态值：

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

## 2. 当前验收项

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| A1 | 扩展可构建 | `npm.cmd run build` | PASS | 2026-04-02 已重新验证 |
| A2 | 自动化测试通过 | `npm.cmd test` | PASS | 2026-04-02 已重新验证，覆盖 task route、research filter、page facts、runtime recovery 等回归 |
| A3 | 扩展可加载到浏览器 | Playwright 真实加载 `dist/` 扩展 | PASS | 已用 Playwright 真实加载扩展并执行联调 |
| A4 | Side Panel 可完整发起 session | Chrome / Playwright 手动 UI 验证 | PARTIAL | runtime 消息链路已可工作，但本轮主要通过 runtime message 和真实浏览器脚本联调，不算完整 side panel UI 回归 |
| A5 | Runtime 可驱动高阶 tool 主循环 | 代码审阅 + Playwright 联调 | PASS | commerce 与 research 都已进入 `compileTask -> searchInSite` 主链，且失败会显式收口 |
| A6 | 页面视觉反馈可见 | Chrome 录屏验证 | PARTIAL | 本轮未重跑视觉回归 |
| A7 | 京东搜索结果可稳定提取至少 3 个商品 | 真实浏览器搜索验证 | FAIL | 干净 profile 下京东搜索会被登录页阻断，当前未得到稳定提取闭环 |
| A8 | 最终结果以统一 Markdown / 结果块输出 | 单测 + 真实浏览器验证 | PARTIAL | aggregating 已统一落地，research 聚合测试已覆盖，但未完成真实站点成功闭环验证 |
| A9 | 失败时不崩溃且能显示明确错误 | Playwright 真实失败路径验证 | PASS | 已从 receiver 错误升级为显式站点阻断错误 |
| A10 | 支持 Gemini provider | 配置 key 后真实请求 | PARTIAL | 代码已接入，当前未单独做 provider 回归 |
| A11 | 支持 DeepSeek provider | 配置 key 后真实请求 | PARTIAL | 代码已接入，当前未单独做 provider 回归 |
| A12 | 小模型负责任务路由和搜索词生成 | 单测 + 真实浏览器联调 | PASS | 已验证小模型优先任务路由；query compile 也已通过真实链路进入搜索 |
| A13 | 支持 `public_research` 调研任务 | 单测 + Playwright 联调 | PARTIAL | research 主链、候选过滤、来源提取、统一聚合已落地，但 Google 在干净 profile 下被 `sorry` 验证页阻断 |
| A14 | receiver 缺失时可回退到 direct bridge | 单测 + Playwright 联调 | PASS | `Could not establish connection` 不再是最终 blocker |

## 3. 当前主要阻断

当前阻断完整闭环的主要问题是目标站点，而不是扩展内部通信：

1. 京东搜索可能跳登录页，导致 `A7` 失败
2. Google 搜索可能进入 `sorry` 验证页，导致 `A13` 只能算 `PARTIAL`
3. Side panel UI 本轮没有做完整手工回归，所以 `A4` 仍保守记为 `PARTIAL`
4. 真正成功的站点级最终输出还没有在真实浏览器里跑通，所以 `A8` 仍保守记为 `PARTIAL`

## 4. 推荐验收顺序

建议每轮迭代按以下顺序验证：

1. `A1`
2. `A2`
3. `A14`
4. `A5`
5. `A9`
6. `A4`
7. `A7`
8. `A8`
9. `A13`
10. `A10 / A11`

## 5. 更新规则

- 验收结果变化时，必须同步更新本文件
- `PARTIAL/FAIL -> PASS` 时，必须补充明确验证方式
- 如果验收项定义发生变化，应同步更新 `doc/spec.md`

Updated: 2026-04-02
