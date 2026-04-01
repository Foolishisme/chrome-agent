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
| A1 | 扩展可构建 | `npm run build` | PASS | 本轮已重新验证 |
| A2 | 测试通过 | `npm test` | PASS | 本轮已重新验证 |
| A3 | 扩展可加载到 Chrome | 加载 `dist/` 目录 | PARTIAL | 构建产物具备，未在本轮手动复验 |
| A4 | Side Panel 可启动 session | Chrome 手动验证 | PARTIAL | 代码骨架具备，需真机验证 |
| A5 | Runtime 可驱动高阶 tool 主循环 | 代码审阅 + 真机验证 | PARTIAL | 代码已切到 phase/tool-first loop，未真机复验 |
| A6 | 页面视觉反馈可见 | Chrome 录屏验证 | PARTIAL | overlay 仍可复用，未本轮录屏验证 |
| A7 | 搜索结果可提取至少 3 个商品 | 真机搜索验证 | FAIL | 当前仍缺京东真机稳定性验证 |
| A8 | 最终结果以 Markdown 或通用结果块输出 | 真机验证 | PARTIAL | 代码已支持 Markdown 输出，未真机复验 |
| A9 | 失败时不崩溃并能显示错误 | 真机失败路径验证 | PARTIAL | 错误通路保留，需真机验证 |
| A10 | 支持 Gemini provider | 配置 key 后真机验证 | PASS | 代码已接入，历史能力保留 |
| A11 | 支持 DeepSeek provider | 配置 key 后真机验证 | PARTIAL | 代码已接入并增加环境配置，未做真实请求验证 |
| A12 | 搜索词由 query compiler 或小模型补全 | 代码审阅 + 真机验证 | PARTIAL | 代码已保留 query compiler + lite refinement，未真机复验 |

---

## 3. 当前阻塞项

当前阻塞 MVP 完整闭环的主要项：

1. `A7` 京东真实页面提取稳定性尚未验证
2. `A5` 高阶 tool 主循环尚未完成真机闭环验证
3. `A8` Markdown 最终输出尚未完成真机确认
4. `A11` DeepSeek 真实请求尚未验证

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
8. `A10 / A11`
9. `A12`

---

## 5. 验收更新规则

- 验收结果变化时，必须更新本文件
- 状态从 `PARTIAL/FAIL` 变为 `PASS` 时，应补充验证方法
- 如果验收项本身变化，应同步更新 `spec.md`

Updated: 2026-04-01
