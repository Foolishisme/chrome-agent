# 2026-04-17 文档系统重构归档

本目录保存文档系统从 `threads / task plan / 默认 ADR` 机制收缩到 `status + logs` 机制时降级的原文材料。

## 归档内容

- `threads-original/`
  - 原 `doc/threads/` 全量内容。
  - 设计结论已摘要迁入 `doc/logs/design.md`。
  - 执行记录已摘要迁入 `doc/logs/exec.md`。
- `plan-original/`
  - 原 `doc/plan/` 任务级计划记录。
  - 后续不再默认创建 `doc/plan/YYYY-MM-DD-*.md`。
- `drafts/`
  - 本次重构前的新讨论稿原文。
  - 核心结论已进入 `AGENTS.md`、`doc/writing_rules.md`、`doc/logs/design.md` 和 `doc/pitfalls.md`。

## 当前规则

- 默认装载：`AGENTS.md`、`doc/spec.md`、`doc/constraints.md`、`doc/status.md`、当前任务所需的单一日志。
- 过程记录：写入 `doc/logs/exec.md`、`doc/logs/review.md` 或 `doc/logs/design.md`。
- 长篇草案、旧线程和任务级计划只用于历史回溯。

Updated: 2026-04-17
