# Codex 文档结构优化建议（3页内）

## 一、结论
当前文档体系已经具备可用基础，方向是对的：你已经有了全局规则、线程模板、状态沉淀和历史归档。问题不在于“文档太少”，而在于**还没有完全升级为一套清晰的调度协议**。

当前最需要补的不是更多内容，而是更硬的分层：

1. **真理源分层不够完整**：缺少 `constraints.md` 与 `plan.md`
2. **线程状态机不够显式**：`status.md` 需要固定成 checkpoint 结构
3. **线程实例与模板未完全分离**：建议补 `review.template.md`，并区分 `active / templates / closed`
4. **历史有了，但决策沉淀还不够结构化**：建议补 `adr/`

一句话判断：

> 现在不是“文档不完善”，而是“文档已经够用，下一步应把它变成协议系统”。

---

## 二、现状评价
当前结构的优点：

- `doc/` 被独立抽出，说明你已经在做“代码空间”和“调度空间”的物理隔离
- `threads/` 下已有模板，说明你已经开始把线程当作协议化对象，而不是临时聊天窗口
- `history/` 已存在，说明你开始做状态沉淀、回放与经验保留
- 根目录有 `AGENTS.md`，说明你有全局最小宪法意识

这套结构**已经过线**，足以支撑你当前的 3 线程工作流。

但当前最大的问题是：一些文件职责还混在一起，长期会导致文档膨胀、线程切换变慢、review 标准漂移。

---

## 三、建议补齐与优化项

### 1. 补 `constraints.md`
这是最优先项。

当前已有 `spec.md / acceptance.md / pitfalls.md`，但缺少一个专门放“硬约束、禁区、红线”的文件。建议新增：

```text
doc/constraints.md
```

内容只放：
- 禁改目录
- 技术边界
- 不允许引入的依赖
- 性能下限
- 向后兼容要求
- 需要人工批准的高风险修改

定位：
- `spec.md` = 做成什么
- `constraints.md` = 绝对不能怎么做

### 2. 补 `plan.md`
当前 `status.md` 很容易同时承担“方案 + 进度 + TODO + 决策说明”，时间一长就会混乱。建议新增：

```text
doc/plan.md
```

内容只放：
- 当前采用的方案
- 模块拆分
- 任务拆解
- 并行/串行依赖
- 当前明确不做的部分

定位：
- `spec.md` = 目标
- `constraints.md` = 红线
- `plan.md` = 路径
- `status.md` = 当前态

### 3. 把 `status.md` 固定为 checkpoint 格式
建议不要把 `status.md` 写成日报或长讨论，而应固定为接力胶囊。

推荐结构：

```md
# Status

## Current Phase
planning / executing / reviewing / blocked / ready_to_merge

## Current Focus
一句话说明当前主战场

## Done
- ...

## In Progress
- ...

## Blockers
- ...

## Rejected Paths
- 方案A：为什么弃用

## Next Actions
1. ...
2. ...

## Needs Human Decision
- 只列真正要你拍板的问题
```

目标：任何人或任何新线程接手时，先读 `status.md` 就能快速进入状态。

### 4. 补 `review.template.md`
你现在有 `design.template.md` 和 `work.template.md`，但 review 线程是你的核心线程之一，不应该缺模板。建议补：

```text
doc/threads/templates/review.template.md
```

推荐结构：

```md
# Review Thread

## Scope
本次只审什么

## Verdict
pass / changes_required / escalate

## Findings
1. ...
2. ...

## Risk Level
low / medium / high

## Required Actions
- ...

## Non-Blocking Suggestions
- ...
```

这样 review 才能稳定承担“裁判线程”的职责，而不是再次变成设计讨论。

### 5. 线程目录分层
建议把当前 `threads/` 从“模板目录”升级成“模板 + 活跃 + 关闭”三层：

```text
doc/threads/
├─ templates/
│  ├─ design.template.md
│  ├─ work.template.md
│  └─ review.template.md
├─ active/
├─ closed/
```

好处：
- 模板和实例不混放
- 当前活跃线程一眼可见
- 关闭线程可归档，不污染工作区

### 6. 为决策单独建立 `adr/`
当前 `history/` 更像事件归档，但不够适合记录“为什么这样决策”。建议新增：

```text
doc/adr/
```

每份 ADR 只记录：
- 背景
- 决策
- 被放弃方案
- 影响

这样：
- `history/` 记录发生了什么
- `adr/` 记录为什么这么做

### 7. 重新审视 `pitfalls.md` 与 `writing_rules.md`
这两个文件最容易膨胀。

建议：
- `pitfalls.md` 只保留高频、已验证的常见坑；硬红线移到 `constraints.md`
- `writing_rules.md` 若本质是线程写作协议，建议改名为 `doc_protocol.md`；若只是表达风格偏好，应降低权重，避免干扰主调度层

---

## 四、推荐目录形态

```text
doc/
├─ README.md
├─ spec.md
├─ constraints.md
├─ plan.md
├─ status.md
├─ acceptance.md
├─ thread_bootstrap.md
├─ doc_protocol.md
├─ known_issues.md
│
├─ threads/
│  ├─ templates/
│  │  ├─ design.template.md
│  │  ├─ work.template.md
│  │  └─ review.template.md
│  ├─ active/
│  └─ closed/
│
├─ adr/
└─ history/
```

---

## 五、优先级排序
建议按下面顺序做，不要一次性大改：

### 第一优先级
1. 新增 `constraints.md`
2. 新增 `plan.md`
3. 固定 `status.md` 为 checkpoint 格式

### 第二优先级
4. 补 `review.template.md`
5. 将 `threads/` 分成 `templates / active / closed`

### 第三优先级
6. 新增 `adr/`
7. 清理或降级 `pitfalls.md` / `writing_rules.md`

---

## 六、最终判断
这套文档结构**不需要推倒重来**。它已经足够支撑你当前的 `1 exec + 1 review + 1 design` 三线程模式。

真正要做的是把现有文档明确成四层：

1. **真理源**：`spec.md / constraints.md`
2. **路径层**：`plan.md`
3. **状态层**：`status.md / threads/active/`
4. **沉淀层**：`history/ / adr/ / known_issues.md`

只要把这四层硬化，你的文档系统就会从“可用”变成“长期稳定可扩展”。

