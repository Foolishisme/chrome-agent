# Thread Docs

## 1. 定位

本目录只存放线程级文档。

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

## 2. 适用规则

- `work`：用于执行、修 bug、落地实现
- `design`：用于思考、设计、方案取舍
- `review`：默认不单独建文档；只有 review 变成多轮追踪事项时再新增

## 3. 命名规则

建议文件名：

- `work-<topic>.md`
- `design-<topic>.md`

例如：

- `work-runtime-loop-stability.md`
- `work-google-blocked-page.md`
- `design-site-adapter-boundary.md`

## 4. 使用顺序

新线程启动时建议按以下顺序读取：

1. `doc/thread_bootstrap.md`
2. 需要的全局文档
3. 对应的线程文档

## 5. 归档规则

- 线程完成、废弃或被合并后，移动到 `doc/history/threads/`
- 已成为项目事实的结论，再同步回对应全局文档
- 未成为项目事实的临时讨论，不写入 `doc/status.md`

Updated: 2026-04-03
