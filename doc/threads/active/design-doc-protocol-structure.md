# Design Thread

## 1. 基本信息

- Thread: `design-doc-protocol-structure`
- Status: `DECIDED`
- Owner:
- Related taskModule: `documentation protocol`
- Updated: 2026-04-03

## 2. Problem

需要把当前 `doc/` 从“可用的文档集合”整理成“清晰分层的调度协议系统”，避免设计、路径、状态、线程和历史继续混写。

## 3. Constraints

- `doc/spec.md`: 当前设计真相已经切换到 `LLM plan-driven tool orchestration`
- `doc/constraints.md`: 文档体系必须先服务于调度，不得反向把架构真相打散
- 已知业务边界：当前项目仍主要围绕 `commerce_search / public_research` 迁移
- 已知技术边界：代码仍处在旧执行循环向新范式迁移前状态
- 明确不做：推倒整个 `doc/`、一次性全面改名、为形式整洁牺牲当前可接力性

## 4. Options

### Option A

- 做法：保持现状，只在现有文件上持续追加内容
- 优点：短期扰动最小
- 代价：职责会继续混写，线程切换和 review 判断会越来越慢
- 风险：`status.md`、线程模板、历史沉淀继续膨胀失真

### Option B

- 做法：补齐 `constraints.md / plan.md`，重构 `status.md` 为 checkpoint，重组 `threads/`，新增 `adr/`
- 优点：能把文档体系硬化成协议层，后续线程切换成本更低
- 代价：需要一次整理结构与入口文档
- 风险：如果同时大改命名和内容，容易扰动过大

## 5. Decision

- 当前推荐方案：`Option B`
- 选择理由：
  - 当前文档已经够用，问题不在数量，而在协议边界不够硬
  - 先补 `constraints / plan`，再固定 `status / threads`，是最小收益最大的整理路径
  - `adr/` 适合承接“为什么这么定”，避免历史快照继续承担决策说明
- 暂不采用什么：
  - 不继续让 `status.md` 同时承担方案、进度、TODO 和讨论记录
  - 不一次性把所有文档重命名

## 6. Impact

- 影响哪些模块：
  - 文档入口与线程调度协议
  - 新线程启动与交接方式
  - 设计决策沉淀方式
- 影响哪些文档：
  - `doc/constraints.md`
  - `doc/plan.md`
  - `doc/status.md`
  - `doc/thread_bootstrap.md`
  - `doc/writing_rules.md`
  - `doc/threads/`
  - `doc/adr/`
- 是否需要新增验收项：
  - 暂不新增代码验收项
  - 但要求后续线程实例与文档职责保持一致

## 7. Open Questions

- `pitfalls.md` 后续是否继续减重，还是暂时保持当前内容
- `writing_rules.md` 是否未来改名为 `doc_protocol.md`
- 是否需要很快补第一批 `work` 线程实例，以避免 `active/` 目录仍然偏空

## 8. Next Actions

1. 在 `doc/threads/active/` 下继续补第一批真实线程实例
2. 后续设计拍板时，优先新增对应 ADR，而不是把原因塞回 `status.md`
3. 等代码迁移稳定后，再决定是否收缩 `pitfalls.md` 与是否重命名 `writing_rules.md`

## 9. Handoff

- 当前结论：
  - 文档体系应固定成四层：真理源、路径层、状态层、沉淀层
  - `status.md` 已被定义为 checkpoint 胶囊
  - `threads/` 已被定义为 `templates / active / closed`
  - `adr/` 用于记录长期有效的结构性决策
- 尚未定稿的部分：
  - `writing_rules.md` 是否改名
  - `pitfalls.md` 的进一步减重策略
- 新线程接手时先验证什么：
  - 新增线程是否都能按当前目录结构正确落位
  - 新的文档职责是否真的减少了混写

Updated: 2026-04-03
