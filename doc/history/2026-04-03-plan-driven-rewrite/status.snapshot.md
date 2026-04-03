# Browser Agent 当前代码现状

## 1. 当前结论

当前代码已经具备双任务类型的高阶 tool 主线：

- `commerce_search`
- `public_research`

当前主循环仍然是 phase-driven 的确定性实现，不是开放式 planner。

## 2. 已落地内容

### 2.1 任务类型判断与任务编译已落地

证据：

- `src/background/query-compiler.ts`
- `src/background/prompting.ts`
- `src/shared/types.ts`

现状：

- 支持 `commerce_search` 与 `public_research`
- `compileTask` 会生成 `taskType`、`taskSpec` 和 `taskPlan`
- 查询词由 lite model 生成

### 2.2 Runtime 已是高阶 tool 驱动

证据：

- `src/background/runtime.ts`
- `src/background/tools.ts`

现状：

- `Runtime` 以 `phase -> tool` 方式调度
- 公开高阶工具已收口为：
  - `compileTask`
  - `searchInSite`
  - `extractStructuredResults`
  - `filterCandidates`
  - `readPageFacts`
  - `aggregateTaskResults`

### 2.3 Commerce 主链已落地

证据：

- `src/content/scanner.ts`
- `src/content/extractor.ts`
- `src/background/result-filter.ts`

现状：

- 当前 commerce 入口是京东
- 商品提取、去重、过滤、汇总都已具备代码实现
- 候选数量、LLM 输入数量和最终展示数量已解耦

### 2.4 Public Research 主链已落地

证据：

- `src/content/research.ts`
- `src/background/result-filter.ts`
- `src/background/tools.ts`

现状：

- 当前 research 入口是 Google
- 已支持提取 Google 第一页候选来源
- 已支持逐页读取来源并提取页面事实
- 已支持调研结果汇总和未解决问题输出

### 2.5 Side Panel 与状态展示已落地

证据：

- `src/sidepanel/index.ts`
- `src/sidepanel/i18n.ts`

现状：

- Side Panel 能展示 `taskType`、`phase`、timeline、候选结果和最终输出
- 已区分 commerce 与 research 两类展示路径

### 2.6 自动化测试已覆盖核心回归

证据：

- `tests/query-compiler.test.ts`
- `tests/runtime-tools.test.ts`
- `tests/scanner.test.ts`
- `tests/public-research.test.ts`

现状：

- 已覆盖任务类型判断
- 已覆盖 commerce 候选提取与过滤
- 已覆盖 public research 候选提取、来源读取与汇总

## 3. 当前仍未完成的部分

### 3.1 仍未抽出正式的 `site adapter` 层

现状：

- 京东站点逻辑仍主要分布在 `src/content/scanner.ts`、`src/content/extractor.ts`、`src/shared/selectors.ts`
- Google research 逻辑仍主要分布在 `src/content/research.ts`

影响：

- 当前可以继续迭代
- 但继续扩站点前需要先收口站点能力边界

### 3.2 仍不是 LLM-driven tool selection

现状：

- 当前 phase 顺序由代码确定
- 还没有基于 `Memory` 的开放式下一步工具选择

影响：

- 当前实现更稳
- 但灵活性仍受限

### 3.3 真机闭环还没有重新完成验收

当前未确认：

- Chrome 加载扩展
- Side Panel 真机启动 session
- 京东真实搜索页闭环
- Google 真正搜索与来源页读取闭环
- Gemini / DeepSeek live request

## 4. 当前阶段判断

当前项目更准确的定位是：

- 已有可运行代码主链
- 已有自动化回归保护
- 仍缺真机与 live provider 验收

因此下一阶段重点不应是继续拆概念，而应是补验证闭环。

## 5. 下一步最小闭环建议

建议按以下顺序推进：

1. 在 Chrome 真机加载扩展并确认 Side Panel 可启动 session
2. 跑通一个京东 commerce 真实闭环
3. 跑通一个 Google public research 真实闭环
4. 根据真机日志再决定是否抽 `site adapter`
5. 在真机稳定前，不升级为更开放的 tool planner

Updated: 2026-04-02
