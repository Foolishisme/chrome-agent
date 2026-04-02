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

## 2. 自动化验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| A1 | 项目可构建 | `npm.cmd run build` | PASS | 本轮已执行 |
| A2 | 自动化测试通过 | `npm.cmd test` | PASS | 本轮已执行 |
| A3 | 任务类型路由正确 | `tests/query-compiler.test.ts` | PASS | 覆盖 `commerce_search/public_research` 路由 |
| A4 | Commerce 提取与过滤回归可通过 | `tests/scanner.test.ts` + `tests/runtime-tools.test.ts` | PASS | 覆盖结果页 readiness、候选提取与过滤 |
| A5 | Public Research 提取与汇总回归可通过 | `tests/public-research.test.ts` | PASS | 覆盖 Google 结果提取、来源页事实提取与聚合 |

## 3. 真机与联调验收

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| M1 | 扩展可加载到 Chrome | 加载 `dist/` 目录 | NOT_RUN | 本轮未手动复验 |
| M2 | Side Panel 可启动 session | Chrome 手动验证 | NOT_RUN | 本轮未手动复验 |
| M3 | 京东 commerce 闭环可完成 | 真机输入购物目标并完成推荐输出 | NOT_RUN | 代码已具备，未做真机确认 |
| M4 | Google public research 闭环可完成 | 真机输入调研目标并完成调研输出 | NOT_RUN | 代码已具备，未做真机确认 |
| M5 | 失败路径可见且 session 不崩溃 | 真机制造失败路径验证 | NOT_RUN | 需手动验证 UI 与错误通路 |
| M6 | Gemini live request 可用 | 配置 key 后真机验证 | NOT_RUN | 未做真实请求验证 |
| M7 | DeepSeek live request 可用 | 配置 key 后真机验证 | NOT_RUN | 未做真实请求验证 |

## 4. 当前阻塞项

当前阻塞完整 MVP 闭环的主要项是：

1. `M1 / M2` Chrome 与 Side Panel 真机入口尚未确认
2. `M3` 京东 commerce 真机闭环尚未确认
3. `M4` Google public research 真机闭环尚未确认
4. `M6 / M7` provider live request 尚未确认

说明：

- 自动化验收已通过，不等于真机闭环已通过
- 对未执行的手动项，本文件保持 `NOT_RUN`

## 5. 推荐验收顺序

建议每次迭代按以下顺序验证：

1. `A1`
2. `A2`
3. `M1`
4. `M2`
5. `M3`
6. `M4`
7. `M5`
8. `M6 / M7`

## 6. 更新规则

- 验收结果变化时，必须更新本文件
- 未验证的项不要写成 `PASS`
- 如果验收项本身变化，应同步更新 `spec.md`

Updated: 2026-04-02
