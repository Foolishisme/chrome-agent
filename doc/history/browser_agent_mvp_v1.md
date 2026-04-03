# 浏览器 Agent MVP v1 历史文档

本文档已从“单文件动态需求源”迁移为“历史版本文档”。

当前有效文档请查看：

- [AGENTS.md](/D:/code/browser-agent-mvp/AGENTS.md)
- [spec.md](/D:/code/browser-agent-mvp/doc/spec.md)
- [thread_bootstrap.md](/D:/code/browser-agent-mvp/doc/thread_bootstrap.md)
- [status.md](/D:/code/browser-agent-mvp/doc/status.md)
- [acceptance.md](/D:/code/browser-agent-mvp/doc/acceptance.md)
- [history 快照目录](/D:/code/browser-agent-mvp/doc/history/2026-04-01-thread-reset/README.md)

## 迁移说明

原先单文件同时承载：

- 目标
- 架构
- 当前状态
- 验收标准

随着实现推进，这种写法容易出现：

- 目标与现状混写
- 验收项与设计描述混写
- 后续优化时不知道应该改哪一章

因此从 2026-04-01 起，文档拆分为：

- `spec.md`
  - 当前有效新设计规范
- `thread_bootstrap.md`
  - 新线程启动上下文
- `status.md`
  - 当前实现现状
- `acceptance.md`
  - 当前验收清单
- `AGENTS.md`
  - 索引与更新规则

## 使用方式

- 想了解当前应该做什么：看 [spec.md](/D:/code/browser-agent-mvp/doc/spec.md)
- 想在新线程中重建设计：看 [thread_bootstrap.md](/D:/code/browser-agent-mvp/doc/thread_bootstrap.md)
- 想了解当前代码做到哪里：看 [status.md](/D:/code/browser-agent-mvp/doc/status.md)
- 想了解当前是否验收通过：看 [acceptance.md](/D:/code/browser-agent-mvp/doc/acceptance.md)
- 想了解文档如何维护：看 [AGENTS.md](/D:/code/browser-agent-mvp/AGENTS.md)
- 想回看线程重启前设计：看 [history 快照目录](/D:/code/browser-agent-mvp/doc/history/2026-04-01-thread-reset/README.md)

Updated: 2026-04-01
