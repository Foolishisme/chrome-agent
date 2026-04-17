# Browser Agent 文档写作规范

## 1. 文档目标

当前文档系统的目标不是覆盖所有上下文，而是形成一套低摩擦调度系统：

- AI 能快速找到高权重事实
- 人能在关键节点接管
- 当前态、过程、经验和历史不混写
- 文档维护成本低于文档收益

默认原则：

> 少量高权重文件 + 极轻状态快照 + 按职责分开的 append-only 日志。

## 2. 默认装载层

新任务默认只装载：

1. `AGENTS.md`
2. `doc/spec.md`
3. `doc/constraints.md`
4. `doc/status.md`
5. 当前任务需要的单一日志：
   - `doc/logs/exec.md`
   - `doc/logs/review.md`
   - `doc/logs/design.md`

禁止为了“了解全貌”一次性装载全部日志、全部历史和全部草案。

## 3. 按需查阅层

以下文档保留职责分离，但不默认装载：

- `doc/interaction.md`
  - 产品表达、交互层级、等待感、结果与过程的关系
- `doc/acceptance.md`
  - 验收项、验证方式、当前验收状态
- `doc/thread_bootstrap.md`
  - 新线程启动提示，仅在需要复制启动上下文时使用
- `doc/plan.md`
  - 项目级迁移路径，仅在讨论路线时使用
- `doc/pitfalls.md`
  - 已确认坑点
- `doc/success_patterns.md`
  - 已验证有效做法
- `doc/adr/`
  - 罕见长期决策回溯
- `doc/history/`、`doc/other/`
  - 历史快照、旧线程、长篇草案、外部材料

## 4. 文档职责

### 4.1 `doc/spec.md`

定位：设计真相。

回答：

- 系统应该是什么
- 当前核心架构和任务模块边界是什么
- 哪些能力属于当前设计基线

不承载：

- 当日进度
- 验证日志
- 长篇方案争论

### 4.2 `doc/constraints.md`

定位：红线与禁区。

回答：

- 绝对不能怎么做
- 哪些边界不能破
- 哪些高风险行为必须人工确认

不承载：

- 偏好型建议
- 普通经验总结
- 当前实现进度

### 4.3 `doc/status.md`

定位：当前态快照。

只保留：

- Current Focus
- Current Phase
- Done
- Blockers
- Next
- Needs Human Decision
- Latest Validation

要求：

- 30 秒内能看懂当前状态
- 不追加历史流水
- 旧进展迁入 `doc/logs/exec.md` 或 `doc/history/`

### 4.4 `doc/logs/exec.md`

定位：执行日志。

记录：

- 做了什么
- 改了哪里
- 验证了什么
- 结果如何
- 剩余风险是什么

推荐格式：

```md
## YYYY-MM-DD HH:mm - task

- Action: ...
- Changed: ...
- Validation: ...
- Result: ...
- Risk: ...
- Next: ...
```

### 4.5 `doc/logs/review.md`

定位：评审日志。

记录：

- review 范围
- 结论
- 关键发现
- 后续动作

推荐格式：

```md
## YYYY-MM-DD HH:mm - scope

- Verdict: pass / changes_required / escalate
- Findings:
  - ...
- Next: ...
```

### 4.6 `doc/logs/design.md`

定位：设计讨论与方案取舍日志。

记录：

- 当前问题
- 备选方案
- 暂定选择
- 原因
- 触发重审条件

推荐格式：

```md
## YYYY-MM-DD HH:mm - question

- Options:
  - A: ...
  - B: ...
- Decision: ...
- Reason: ...
- Revisit Trigger: ...
```

### 4.7 `doc/interaction.md`

定位：交互表达规则。

保留原因：

- 它回答“用户如何理解、等待、信任和接管系统”
- 不应并入 `spec.md` 或 `status.md`

### 4.8 `doc/acceptance.md`

定位：验收口径。

保留原因：

- 它回答“怎样算通过”
- 不应并入 `status.md` 的当前态描述

要求：

- 验收项必须可验证
- 未验证项不要写成 `PASS`
- 验收口径变化时同步检查 `spec.md`

## 5. 降级机制

### 5.1 `doc/threads/`

不再作为日常机制。

旧线程处理方式：

- 执行过程迁入 `doc/logs/exec.md`
- review 结论迁入 `doc/logs/review.md`
- 设计取舍迁入 `doc/logs/design.md`
- 原文移入 `doc/history/`

### 5.2 `doc/plan/`

不再创建任务级 plan 文件。

替代规则：

- 计划取舍写入 `doc/logs/design.md`
- 执行结果写入 `doc/logs/exec.md`
- 项目级长期迁移路径仍可保留在 `doc/plan.md`

### 5.3 `doc/adr/`

ADR 从默认沉淀机制降级为罕见例外机制。

只有同时满足以下条件时才新增 ADR：

- 影响长期架构边界
- 未来很可能被反复挑战
- 单看 `spec.md / constraints.md` 看不出为什么这样定
- 该决策跨多个任务周期仍有效

普通设计取舍写入 `doc/logs/design.md`。

### 5.4 长篇草案与复盘

处理方式：

- 核心经验提炼进 `pitfalls.md` 或 `success_patterns.md`
- 原文移入 `doc/history/` 或 `doc/other/`
- 不参与默认装载

## 6. 更新规则

- 设计真相变化：更新 `doc/spec.md`
- 红线变化：更新 `doc/constraints.md`
- 交互表达变化：更新 `doc/interaction.md`
- 验收口径或验收状态变化：更新 `doc/acceptance.md`
- 当前 checkpoint 变化：更新 `doc/status.md`
- 执行动作与验证：追加 `doc/logs/exec.md`
- review 结论：追加 `doc/logs/review.md`
- 设计讨论与取舍：追加 `doc/logs/design.md`
- 已确认坑点：更新 `doc/pitfalls.md`
- 已验证有效做法：更新 `doc/success_patterns.md`

## 7. 当前推荐结构

```text
AGENTS.md

doc/
├─ spec.md
├─ constraints.md
├─ interaction.md
├─ acceptance.md
├─ status.md
├─ writing_rules.md
├─ logs/
│  ├─ exec.md
│  ├─ review.md
│  └─ design.md
├─ pitfalls.md
├─ success_patterns.md
├─ history/
└─ other/
```

允许保留但不默认使用：

- `doc/plan.md`
- `doc/thread_bootstrap.md`
- `doc/adr/`

Updated: 2026-04-17
