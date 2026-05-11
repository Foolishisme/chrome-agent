# Browser Agent 文档规则

## 1. 定位

本文定义当前仓库的文档纪律。

仓库采用当前态文档。事实源文档只描述当前架构、约束、checkpoint 和验收目标。

## 2. 事实源文件

默认阅读顺序：

1. `doc/spec.md`
2. `doc/constraints.md`
3. `doc/checkpoint.md`
4. 验证范围相关任务读取 `doc/acceptance.md`

辅助文件：

- `doc/interaction.md` 记录产品交互规则
- `doc/writing_rules.md` 记录文档纪律

## 3. 文件职责

- `doc/spec.md`：设计真相、组件边界、执行模型。
- `doc/constraints.md`：硬约束、禁区和升级边界。
- `doc/checkpoint.md`：当前阶段、当前链路、当前差距、下一步、验证快照。
- `doc/acceptance.md`：验收场景和验证状态。
- `doc/interaction.md`：UI 与交互行为。
- `AGENTS.md`：短启动指南。
- `README.md`：项目概览和本地命令。

## 4. Checkpoint 规则

`doc/checkpoint.md` 在当前 checkpoint 变化时覆盖更新。

它应包含：

- 当前阶段；
- 当前主链；
- 有效源码根；
- 当前能力；
- 当前差距；
- 一个下一步；
- 验证快照。

它不应包含：

- 过程日记；
- 对话转录；
- 大型参考材料；
- 推测性 backlog；
- spec 或 constraints 的重复副本。

## 5. 新文档准入

只有当永久文档有当前负责人和当前读者时才新增。

有效理由：

- 当前事实源需要；
- 验收面需要；
- 操作说明需要；
- 用户明确要求且读者明确。

无效理由：

- 以后可能有用；
- 记录已经结束的讨论；
- 存放大型参考包；
- 保存未采纳方案。

## 6. 更新规则

- 更新拥有该事实的最小事实源文件。
- 用当前文字替换失效文字。
- 避免在 `AGENTS.md`、`spec.md`、`constraints.md` 和 `checkpoint.md` 中重复同一规则。
- `AGENTS.md` 保持短小，链接到详细文档。
- 审计轨迹交给 Git commit 和 diff。

## 7. 验证规则

纯文档修改应检查已删除文档入口、失效迁移措辞和非预期工作区变更。

任何剩余命中都必须是当前产品术语或当前源码路径，并且有清晰理由。

更新日期：2026-05-11
