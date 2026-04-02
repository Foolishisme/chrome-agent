# Browser Agent 新线程现状

## 1. 文档定位

本文档描述当前代码相对于新设计的位置。

它关注两件事：

- 新主线已经落到哪里
- 还缺哪些环节才能形成稳定闭环

---

## 2. 当前代码现实情况

当前代码已经不再是旧的细粒度主循环。

当前主线已经调整为：

- `Agent = LLM + Memory + Tools + Runtime`
- Runtime 负责 session、phase、tool 调度、校验、容错
- Tools 负责搜索、提取、过滤、总结等高阶能力
- Memory 保存 phase、tool history、facts、failures、final output
- 当前主链已调整为：搜索词规划直接由小模型生成，提取/过滤/恢复仍由 tools 负责

当前仍然是：

- 京东单站点优先
- phase 驱动的 tool loop
- 不是完全开放式的多站点 planner

---

## 3. 已落地的核心变化

### 3.1 Runtime 已切到 tool-first

`src/background/runtime.ts`

- 主循环按 `phase -> tool` 调度
- runtime 不再硬编码搜索、提取、过滤、总结细节
- runtime 保留扫描、动作执行、页面等待、状态广播、错误处理

### 3.2 高阶 tools 已抽象出来

`src/background/tools.ts`

当前已落地的高阶 tools：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `finishWithSummary`

本轮新增收敛：

- `compileTask` 已改为“用户意图 -> 小模型搜索词”，不再先做规则化 query 拼装
- `finishWithSummary` 已恢复 LLM 输出，由模型基于过滤后的候选生成最终 Markdown 结果
- `extractStructuredResults`、`filterCandidates` 只负责候选提取、去重、预算过滤与诊断，不提前决定最终展示内容
- 候选不足时继续走滚动恢复，不会因为搜索结果页 ready 判定过严而提前中断

### 3.3 搜索词与候选数量已解耦

`src/background/query-compiler.ts`
`src/background/result-filter.ts`
`src/content/extractor.ts`

- `topK` 保留为用户最终想看的结果数
- 新增 `llmInputLimit`，默认向 LLM 提供前 10 个过滤后的候选
- 新增 `extractLimit`，提取阶段默认抓取更多候选，避免过早截断
- 结果过滤不再直接裁到最终展示数，而是保留给 LLM 做排序与输出
- 搜索 query 不再依赖预算/品类规则提取，而是直接由 one-shot prompt 驱动的小模型生成

### 3.4 搜索结果页 ready 判定已放宽

`src/content/scanner.ts`

- 搜索页只要搜索框可用，且结果区满足“空态明确”或“存在商品链接/卡片”，就允许进入提取
- 解决了“页面上已有可提取商品链接，但状态流仍判未就绪”的问题
- 当搜索结果已经可提取时，不再把“搜索框必须识别成功”作为硬阻塞条件

### 3.5 提取器保留主选择器 + fallback heuristic

`src/content/extractor.ts`

- 继续优先使用已知 JD 结果卡片选择器
- 当 legacy card selector 未命中时，允许通过商品链接做 fallback 提取
- 仍输出 diagnostics，方便后续真机微调

### 3.6 自动化回归已覆盖本轮改动

- `tests/scanner.test.ts`
  - 覆盖 link-based result readiness
  - 覆盖无 legacy cards 时仍可提取商品
- `tests/runtime-tools.test.ts`
  - 覆盖“小模型直接生成站内搜索词”
  - 覆盖 LLM 不可用时的规则摘要 fallback
  - 覆盖候选不足时滚动恢复

---

## 4. 与新设计仍有差距的部分

### 4.1 LLM 还没有承担“动态选择下一步 tool”

当前实现仍是 phase 驱动：

- 稳定性更高
- 更适合先跑通京东

但与最终目标相比，仍缺少：

- 基于 memory 的动态 tool selection
- 更开放的 planner

### 4.2 Site adapter 还没有正式独立成层

当前虽然已经保留通用设计方向，但京东站点逻辑仍主要分布在：

- `src/content/scanner.ts`
- `src/content/extractor.ts`
- `src/shared/selectors.ts`

后续如果要扩多站点，应把这些能力再收口成 `site adapter`。

### 4.3 真机闭环还没重新验收

当前已通过：

- `npm.cmd test`
- `npm.cmd run build`

当前未完成：

- Chrome 真机加载验证
- 京东真实搜索页面闭环验证
- provider 真实请求验证

---

## 5. 当前可直接复用的模块

仍建议保留并继续演进：

- `src/background/runtime.ts`
- `src/background/tools.ts`
- `src/background/query-compiler.ts`
- `src/background/result-filter.ts`
- `src/background/llm-client.ts`
- `src/content/actions.ts`
- `src/content/scanner.ts`
- `src/content/extractor.ts`
- `src/content/overlay.ts`
- `src/shared/*`
- `src/sidepanel/index.ts`

---

## 6. 当前阶段结论

当前项目已经进入“高阶 tool 主线的第一版可运行实现”。

这意味着：

1. 新主线已经落到了代码层
2. 京东单站点闭环的结构已经基本对齐设计
3. 本轮已把“搜索词规划/最终输出”重新交回 LLM，把“提取/过滤/恢复”继续留在 tools
4. 下一步重点是做真机稳定性验证，而不是继续拆概念

---

## 7. 下一步最小重构重点

建议按这个顺序继续推进：

1. 真机验证 `"MacBook 对比前3个"` 闭环
2. 根据真机日志继续微调 JD 结果页选择器
3. 将京东逻辑进一步抽为 site adapter
4. 再考虑把 phase-driven tool selection 升级为 LLM-driven tool selection

Updated: 2026-04-01
