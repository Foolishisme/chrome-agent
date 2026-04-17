# Browser Agent 文档写作规范

## 1. 文档目标

当前文档系统用于低摩擦调度，不用于复刻全部上下文。

目标：

- AI 能快速找到高权重事实。
- 人能在关键节点接管。
- 当前态、过程、经验和历史不混写。
- 文档维护成本低于收益。

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

禁止为了“了解全貌”一次性装载全部日志、全部历史和全部 reference。

## 3. 职责核心层

以下文件保留在 `doc/` 根目录，但只在触发对应问题时读取：

- `doc/interaction.md`
  - 产品表达、交互层级、等待感、结果与过程关系。
- `doc/acceptance.md`
  - 验收项、验证方式、当前验收状态。
- `doc/writing_rules.md`
  - 文档系统自身规则。

## 4. 按需查阅层

`doc/reference/` 存放非默认装载材料：

- `doc/reference/pitfalls.md`
  - 已确认坑点。
- `doc/reference/success_patterns.md`
  - 已验证有效做法。
- `doc/reference/thread_bootstrap.md`
  - 新线程启动提示。
- `doc/reference/design_principles.md`
  - 架构取舍、模块拆分、抽象边界和文档系统调整时按需查阅的设计原则。
- `doc/reference/adr/`
  - 罕见长期决策回溯。

`doc/history/` 和 `doc/other/` 存放历史快照、旧线程、长篇草案和外部材料。

## 5. 主文档写法

主文档只写当前成立的规则、边界和不变量。

主文档不得复制：

- 代码可直接查到的接口字段。
- schema 枚举。
- tool 注册完整列表。
- 某次迁移的完成流水。
- 日期补丁。

代码细节以代码为准：

- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/background/tools/registry.ts`
- `src/background/runtime-core.ts`

过去式处理规则：

- 执行动作、验证结果、剩余风险进入 `doc/logs/exec.md`。
- 设计讨论、方案取舍、触发重审条件进入 `doc/logs/design.md`。
- review 范围、结论和发现进入 `doc/logs/review.md`。
- 长篇原文和旧材料进入 `doc/history/` 或 `doc/other/`。

未来事项处理规则：

- 未拍板方向、下一阶段能力、非当前范围事项不得写成当前事实。
- 如果只是在讨论中出现，写入 `doc/logs/design.md` 的建议、风险或 revisit trigger。
- 如果影响当前接手判断，写入 `doc/status.md` 的 `Next` 或 `Remaining Risks`。
- 除非用户明确要求进入实现，否则不得把未来事项顺手落成代码或主链能力。

## 6. 文件职责

### 6.1 `doc/spec.md`

定位：设计真相。

只回答：

- 系统应该是什么。
- 当前核心架构和任务模块边界是什么。
- 哪些不变量不能破。

不承载：

- 字段级接口复刻。
- 进度流水。
- 过期方案。

### 6.2 `doc/constraints.md`

定位：红线与禁区。

只回答：

- 绝对不能怎么做。
- 哪些边界不能破。
- 哪些高风险行为必须人工确认。

### 6.3 `doc/status.md`

定位：当前态快照。

只保留：

- Current Focus
- Current Phase
- Done
- Blockers
- Remaining Risks
- Next
- Needs Human Decision
- Latest Validation

要求：30 秒内能看懂当前状态。

### 6.4 `doc/interaction.md`

定位：交互表达规则。

只回答用户如何理解、等待、信任和接管系统。

### 6.5 `doc/acceptance.md`

定位：验收口径。

只记录验收项、验证方式、当前状态和必要备注。

## 7. 降级机制

### 7.1 `doc/plan.md`

无 active migration 时，不保留 active `doc/plan.md`。

只有存在明确跨天迁移任务时，才临时恢复 `doc/plan.md`；迁移完成后归档。

普通计划、取舍和执行记录分别进入 `doc/logs/design.md` 与 `doc/logs/exec.md`。

### 7.2 `doc/threads/`

不再作为日常机制。

旧线程原文进入 `doc/history/`，结论摘要进入对应 log。

### 7.3 ADR

ADR 从默认沉淀机制降级为罕见例外机制。

只有同时满足以下条件时才新增 `doc/reference/adr/` 记录：

- 影响长期架构边界。
- 未来很可能被反复挑战。
- 单看 `spec / constraints / logs` 看不出为什么这样定。
- 该决策跨多个任务周期仍有效。

普通设计取舍写入 `doc/logs/design.md`。

## 8. 更新规则

- 设计真相变化：更新 `doc/spec.md`
- 红线变化：更新 `doc/constraints.md`
- 当前 checkpoint 变化：更新 `doc/status.md`
- 交互表达变化：更新 `doc/interaction.md`
- 验收口径或验收状态变化：更新 `doc/acceptance.md`
- 文档系统规则变化：更新 `doc/writing_rules.md`
- 执行动作与验证：追加 `doc/logs/exec.md`
- review 结论：追加 `doc/logs/review.md`
- 设计讨论与取舍：追加 `doc/logs/design.md`
- 已确认坑点：更新 `doc/reference/pitfalls.md`
- 已验证有效做法：更新 `doc/reference/success_patterns.md`
- 新线程启动提示：更新 `doc/reference/thread_bootstrap.md`

## 9. 当前推荐结构

```text
doc/
├─ spec.md
├─ constraints.md
├─ status.md
├─ interaction.md
├─ acceptance.md
├─ writing_rules.md
├─ logs/
├─ review/
├─ reference/
│  ├─ pitfalls.md
│  ├─ success_patterns.md
│  ├─ thread_bootstrap.md
│  ├─ design_principles.md
│  └─ adr/
├─ history/
└─ other/
```

Updated: 2026-04-17
