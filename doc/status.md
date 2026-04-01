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
- Memory 开始保存 phase、tool history、facts、failures、final output
- LLM 当前主要负责搜索词补全和最终总结

当前仍然是：

- 京东单站点优先
- phase 驱动的 tool loop
- 不是完全开放式的多站点 planner

---

## 3. 已落地的核心变化

### 3.1 Runtime 已切到 tool-first

`src/background/runtime.ts`

- 主循环改成按 `phase -> tool` 调度
- runtime 不再硬编码搜索、提取、过滤、总结细节
- runtime 只保留扫描、动作执行、页面等待、状态广播、错误处理

### 3.2 高阶 tools 已抽象出来

`src/background/tools.ts`

当前已落地的高阶 tools：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `finishWithSummary`

说明：

- 当前 tools 面向京东闭环实现
- 接口层已经是高阶 tool 形态
- 底层原子动作仍复用 content 层能力

### 3.3 LLM provider 已抽象

`src/background/llm-client.ts`

当前已支持：

- Gemini
- DeepSeek

当前方式：

- 通过环境变量切换 provider
- query refinement 与 final summary 统一走 provider 门面

### 3.4 UI 已开始对齐新主线

`src/sidepanel/index.ts`

当前已支持展示：

- 当前 phase
- 当前 tool
- tool-first 的运行状态
- 最终 Markdown 输出

---

## 4. 与新设计仍有差距的部分

### 4.1 LLM 还没有承担“动态选择下一步 tool”

当前实现是 phase 驱动：

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

- `npm test`
- `npm run build`

当前未完成：

- Chrome 真机加载验证
- DeepSeek 真请求验证
- 京东真实搜索页面闭环验证

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

当前项目已经从“旧的细粒度 loop”进入“高阶 tool 主线的第一版实现”。

这意味着：

1. 新主线已经落到了代码层
2. 京东单站点闭环的结构已经基本对齐设计
3. 下一步重点不再是继续拆概念，而是做真机稳定性验证
4. 多站点通用化应放在真机跑通之后推进

---

## 7. 下一步最小重构重点

建议按这个顺序继续推进：

1. 真机验证京东闭环
2. 验证 DeepSeek provider 真实请求
3. 将京东逻辑进一步抽为 site adapter
4. 再考虑把 phase-driven tool selection 升级为 LLM-driven tool selection

Updated: 2026-04-01
