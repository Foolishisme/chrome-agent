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
| A1 | 扩展可构建 | `npm run build` | PASS | 已验证 |
| A2 | 测试通过 | `npm test` | PASS | 已验证 |
| A3 | 扩展可加载到 Chrome | 加载 `dist/` 目录 | PARTIAL | 构建产物具备，未在本次文档迁移中重新人工验证 |
| A4 | Side Panel 可启动 session | Chrome 手动验证 | PARTIAL | 代码路径存在，需真机验证 |
| A5 | Runtime 可跑通单轮循环 | 代码审阅 + 真机验证 | PARTIAL | 代码已实现主循环，需真机闭环验证 |
| A6 | 页面视觉反馈可见 | Chrome 录屏验证 | PARTIAL | 代码已实现 overlay，需真机验证 |
| A7 | 搜索结果可提取至少 3 个商品 | 真机搜索验证 | FAIL | 当前主要问题点 |
| A8 | 失败时不崩溃并能显示错误 | 真机失败路径验证 | PARTIAL | 已有错误通路，需真机验证 |
| A9 | 支持 Gemini provider | 配置 key 后真机验证 | PASS | 代码已接入 |
| A10 | 支持 DeepSeek provider | 配置 key 后真机验证 | FAIL | 当前未实现 |

---

## 3. 当前阻塞项

当前阻塞 MVP 完整闭环的主要项：

1. `A7` 搜索结果提取不稳定
2. `A10` DeepSeek provider 未接入

说明：

- 如果当前阶段只要求“内部演示 + 单 provider 跑通”，则 `A10` 可暂时降级为非阻塞
- `A7` 仍是当前第一阻塞项

---

## 4. 推荐验收顺序

建议每次迭代按以下顺序验证：

1. `A1`
2. `A2`
3. `A4`
4. `A5`
5. `A7`
6. `A6`
7. `A8`
8. `A9 / A10`

---

## 5. 验收更新规则

- 验收结果变化时，必须更新本文件
- 状态从 `PARTIAL/FAIL` 变为 `PASS` 时，应补充验证方法
- 如果验收项本身变化，应同步更新 `spec.md`

Updated: 2026-04-01
