# Design Thread

## 1. 基本信息

- Thread: `design-direct-answer-routing`
- Status: `DECIDED`
- Owner:
- Related taskModule: `direct_answer / public_research / commerce_search`
- Updated: 2026-04-08

## 2. Problem

当前产品表层已是对话输入与回答流，但主链定义里还没有“无需搜索即可直接回答”的正式路由，导致系统默认把大量非购物问题都推向搜索链路。

## 3. Constraints

- `doc/spec.md`: 当前执行范式是 `LLM plan-driven tool orchestration`
- `doc/constraints.md`: runtime 不应替 `LLM` 做任务级语义决策，也不能把所有问题写死到固定 workflow
- 已知业务边界：当前主线仍以 `commerce_search / public_research` 为主
- 已知技术边界：当前代码里的 `TaskType` 还只有两类，搜索判断主要靠旧路由逻辑
- 明确不做：直接开放 raw DOM 给 `LLM`、直接引入长记忆系统、为了 direct answer 重做整套 runtime

## 4. Options

### Option A

- 做法：保持现状，继续把绝大多数非购物问题都路由到 `public_research`
- 优点：短期代码改动最少
- 代价：对话体验会持续显得“逢问必搜”，无法复用已有证据或稳定内置知识
- 风险：简单问答成本过高，用户会质疑 agent 为什么不会直接回答

### Option B

- 做法：新增 `direct_answer` task module，由 `LLM` 在规划阶段判断是否需要搜索
- 优点：更符合对话产品心智，也更符合“LLM 是决策核心”的架构定义
- 代价：需要补 task routing、prompt 输入和验收口径
- 风险：如果不给 `LLM` 当前时间和证据时间，只说“直接判断是否需要搜索”，会让时效性判断不稳

## 5. Decision

- 当前推荐方案：`Option B`
- 选择理由：
  - 是否需要搜索本质上是任务级语义决策，应由 `LLM` 判断
  - “直接回答”应该成为正式 task module，而不是 UI 层偶然出现的一种展示形式
  - 搜索判断不能只靠问题文本，还应显式带入当前绝对时间、用户时区和已有证据时间
- 暂不采用什么：
  - 不把所有非购物问题继续默认路由到 `public_research`
  - 不只传“今天 / 现在 / 最近”这类相对时间让 `LLM` 自行猜测
  - 不因为追求保险，就对已有证据充足的追问继续重复搜索

## 6. Impact

- 影响哪些模块：
  - `TaskType` 路由
  - `compileTaskSpec`
  - 最终汇总工具集合
  - 对话内追问复用已有证据的路径
- 影响哪些文档：
  - `doc/spec.md`
  - `doc/constraints.md`
  - `doc/plan.md`
  - `doc/status.md`
  - `doc/acceptance.md`
  - `doc/thread_bootstrap.md`
- 是否需要新增验收项：
  - 需要，至少补 `direct_answer` 主链、时效敏感问题强制搜索、时间与证据输入显式注入

## 7. Open Questions

- `direct_answer` 是否只保留 `compileTaskSpec -> finalizeDirectAnswer` 两步，还是后续需要单独的 evidence-check tool
- 当 `LLM` 不可用时，路由回退规则要保守到什么程度
- 当前 conversation 中要带入几轮证据摘要，才能兼顾可用性与上下文成本

## 8. Next Actions

1. 在代码侧新增 `direct_answer` task type 与 `finalizeDirectAnswer`
2. 在路由 prompt 中显式注入当前绝对时间、用户时区和近期证据时间
3. 补最小单测，验证“可直接答”和“必须搜索”两类路由

## 9. Handoff

- 当前结论：
  - `direct_answer` 应成为正式 task module
  - 是否需要搜索由 `LLM` 在规划阶段判断
  - 搜索判断输入必须带当前时间和证据时间，不能只给相对时间词
- 尚未定稿的部分：
  - 代码层具体放在哪个 schema / prompt 入口
  - 无 `LLM` 时的保守回退规则
- 新线程接手时先验证什么：
  - `TaskType` 是否已从两类扩成三类
  - 非时效性追问是否还能被错误路由到搜索链路

Updated: 2026-04-08
