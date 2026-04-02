# Browser Agent MVP 验收清单

## 1. 文档定位

本文档定义当前 MVP 的验收项、验证方式与当前状态。

状态定义：

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT_RUN`

---

## 2. 当前验收项

| 编号 | 验收项 | 验证方式 | 当前状态 | 备注 |
|---|---|---|---|---|
| A1 | 扩展可构建 | `npm.cmd run build` | PASS | 本轮已重新验证 |
| A2 | 测试通过 | `npm.cmd test` | PASS | 本轮新增 link-based readiness 与纯 tools 回归测试 |
| A3 | 扩展可加载到 Chrome | 加载 `dist/` 目录 | PARTIAL | 构建产物具备，未在本轮手动复验 |
| A4 | Side Panel 可启动 session | Chrome 手动验证 | PARTIAL | 代码骨架具备，需真机验证 |
| A5 | Runtime 可驱动高阶 tool 主循环 | 代码审阅 + 真机验证 | PARTIAL | 代码已切到 phase/tool-first loop，本轮修复了 tools 提取主链，但未真机复验 |
| A6 | 页面视觉反馈可见 | Chrome 录屏验证 | PARTIAL | overlay 仍可复用，未本轮录屏验证 |
| A7 | 搜索结果可提取至少 3 个商品 | 真机搜索验证 | FAIL | 已补 link-based readiness 与提取回归测试，但仍缺京东真机稳定性验证 |
| A8 | 最终结果以 Markdown 或通用结果块输出 | 真机验证 | PARTIAL | 当前已恢复 LLM Markdown 输出，并保留规则 fallback，未真机复验 |
| A9 | 失败时不崩溃并能显示错误 | 真机失败路径验证 | PARTIAL | 错误通路保留，需真机验证 |
| A10 | 支持 Gemini provider | 配置 key 后真机验证 | PARTIAL | 代码已接入，但本轮不在主链范围且未重新验证 |
| A11 | 支持 DeepSeek provider | 配置 key 后真机验证 | PARTIAL | 代码已接入，未做真实请求验证 |
| A12 | 搜索词由小模型直接生成 | 代码审阅 + 真机验证 | PARTIAL | 当前主链已改为“用户意图 -> 小模型搜索词”，并引入 `llmInputLimit/extractLimit`，未做真机复验 |

---

## 3. 当前阻塞项

当前阻塞 MVP 完整闭环的主要项：

1. `A7` 京东真实搜索页“至少提取 3 个商品”仍未做真机确认
2. `A4 / A5` Side Panel 到 runtime 的真机闭环尚未重新回归
3. `A8` 最终结果输出尚未完成真机确认

说明：

- 本轮已补自动化验证，但没有把未做真机验证的项误标为 `PASS`
- `A7` 仍是当前第一阻塞项

---

## 4. 推荐验收顺序

建议每次迭代按以下顺序验证：

1. `A1`
2. `A2`
3. `A4`
4. `A5`
5. `A7`
6. `A8`
7. `A9`
8. `A10 / A11 / A12`

---

## 5. 验收更新规则

- 验收结果变化时，必须更新本文件
- 状态从 `PARTIAL/FAIL` 变为 `PASS` 时，应补充验证方法
- 如果验收项本身变化，应同步更新 `spec.md`

Updated: 2026-04-01
