# Thread Docs

## 1. 定位

本目录只存放线程级协议与线程实例。

线程文档用于承载：

- 单个线程的局部目标
- 单个线程的范围边界
- 当前决策、阻塞和下一步
- 新线程接续或旧线程交接所需的最小上下文

线程文档不替代以下全局文档：

- `doc/spec.md`
- `doc/thread_bootstrap.md`
- `doc/status.md`
- `doc/acceptance.md`
- `doc/pitfalls.md`

## 2. 目录结构

当前统一结构为：

- `templates/`
- `active/`
- `closed/`

语义：

- `templates/`：线程模板
- `active/`：当前仍在推进的线程实例
- `closed/`：本轮已关闭但仍可能短期回看的线程实例
- `doc/history/threads/`：彻底归档后的长期历史

## 3. 线程类型

- `work`：用于执行、修 bug、落地实现
- `design`：用于思考、设计、方案取舍
- `review`：用于裁判线程、结论线程、风险判定线程

## 4. 命名规则

建议文件名：

- `work-<topic>.md`
- `design-<topic>.md`
- `review-<topic>.md`

例如：

- `work-runtime-loop-stability.md`
- `work-google-blocked-page.md`
- `design-site-adapter-boundary.md`
- `review-runtime-contract.md`

## 5. 使用顺序

新线程启动时建议按以下顺序读取：

1. `doc/thread_bootstrap.md`
2. 对应的全局文档
3. `doc/threads/active/` 下的对应线程实例
4. 如无实例，再从 `doc/threads/templates/` 复制模板创建

## 6. 归档规则

- 线程完成后，先移动到 `doc/threads/closed/`
- 当前工作周期彻底结束后，再从 `doc/threads/closed/` 移动到 `doc/history/threads/`
- 已成为项目事实的结论，再同步回对应全局文档
- 未成为项目事实的临时讨论，不写入 `doc/status.md`

Updated: 2026-04-03
