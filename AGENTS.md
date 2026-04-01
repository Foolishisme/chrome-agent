# Browser Agent 文档与协作约定

本仓库当前采用“索引 + 规范 + 状态 + 验收”四类文档组织。

## 文档索引

- [规范：spec.md](/D:/code/browser-agent-mvp/doc/spec.md)
- [状态：status.md](/D:/code/browser-agent-mvp/doc/status.md)
- [验收：acceptance.md](/D:/code/browser-agent-mvp/doc/acceptance.md)
- [历史版本：browser_agent_mvp_v1.md](/D:/code/browser-agent-mvp/doc/browser_agent_mvp_v1.md)

## 各文档职责

- `AGENTS.md`
  - 仓库级协作规则
  - 文档索引
  - 更新策略
- `doc/spec.md`
  - 当前有效的产品与架构规范
  - 目标、边界、核心模型、流程、接口职责
- `doc/status.md`
  - 当前代码实现状态
  - 已实现、未实现、已知偏差、下一步
- `doc/acceptance.md`
  - 当前验收项
  - 验证方式
  - 通过状态
- `doc/browser_agent_mvp_v1.md`
  - 历史迁移文档
  - 不再作为唯一动态真相来源

## Source Of Truth

- 目标与架构：`doc/spec.md`
- 当前实现现状：`doc/status.md`
- 当前验收口径：`doc/acceptance.md`

如果三者冲突，优先处理顺序为：

1. 先确认 `spec.md` 是否过期
2. 再确认代码是否落后于 `spec.md`
3. 最后更新 `status.md` 和 `acceptance.md`

## 更新策略

发生以下变化时，必须同步文档：

- 需求或架构变化：更新 `doc/spec.md`
- 代码实现变化：更新 `doc/status.md`
- 验收标准或验证结果变化：更新 `doc/acceptance.md`

不允许以下情况长期存在：

- 代码已改，但 `status.md` 仍描述旧实现
- 验收口径已改，但 `acceptance.md` 未更新
- 目标已改变，但 `spec.md` 仍保留旧路径

## 当前阶段约定

- 当前阶段仍是内部 MVP
- 以“能跑通、能定位问题、能持续迭代”为优先目标
- 文档优先帮助定位问题属于哪一层：
  - `LLM`
  - `Memory`
  - `Tools`
  - `Runtime`
  - `UI`

Updated: 2026-04-01
