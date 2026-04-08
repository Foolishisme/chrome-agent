# Browser Agent 状态检查点

## 1. Current Phase

`implementation`

## 2. Current Focus

当前主线已经从“过渡层迁移”切到“canonical v1 收口完成后的稳定化”，当前重点转为结果交付收口与 research 第一页来源质量提升：

- Runtime 已是 canonical plan loop
- Tools 已按 `src/background/tools/` 拆分
- 状态模型、tool 契约、最终输出契约已统一
- Side Panel 已改为读取 `finalResult`
- `commerce_search / public_research` 真机闭环已通过，当前记录为 `user-reported`
- 结果输出已收口为 `inline | artifact`
- `public_research` 已在第一页过滤后增加轻量 research 候选重排序
- 下一步优先验证第一页候选质量提升是否真实改善读源命中率

## 3. Done

### 3.1 协议

- `src/shared/types.ts`
  - canonical `ToolName` 已收口
  - `ActionResult` / 高层 `ToolResult` 已分离
  - `FinalResult` 已统一并增加 `outputMode`
  - `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 已退出主链

- `src/shared/schema.ts`
  - `nextToolSelectionSchema` 只允许 canonical tool
  - `finalResultSynthesisSchema` 已对齐新 `FinalResult`
  - `actionResultSchema` 已替代旧 action-level `ToolResult`
  - research 候选重排序 schema 已新增

### 3.2 Runtime / Tools

- `src/background/runtime-core.ts`
  - runtime 已改为静态 plan 驱动循环
  - 单工具 step 不调用 LLM
  - 多工具 step 才调用 `chooseNextTool`
  - 已落地重复失败和无进展护栏

- `src/background/tools/`
  - 已拆为共享 helper、registry 和 7 个 canonical tool 文件

- `src/background/tools.ts`
  - 已退化为 barrel export
- `src/background/tools/collect-research-candidates.ts`
  - 已在第一页 research 候选过滤后增加轻量重排序
- `src/background/llm-client.ts`
  - 已新增 research 候选重排序调用与严格回退

### 3.3 UI

- `src/sidepanel/index.ts`
  - 结果区已按 `inline | artifact` 分流
  - 运行细节已回收到 runtime 区
  - 文档产物仅在显式文档请求下展示复制 / 下载
  - 不再依赖 `currentPhase`

- `src/sidepanel/i18n.ts`
  - runtime 状态已收口为 `idle | running | done | error`

### 3.4 文档

- `doc/adr/0002-converge-runtime-tool-contracts.md` 已新增
- `spec / constraints / plan / status / acceptance` 已对齐当前代码事实

## 4. Validation

最新验证检查点：

- `npm.cmd test`
  - 11 个测试文件，71 个测试通过
- `npm.cmd run build`
  - 通过
- `npx.cmd vitest run tests/research-search-quality.test.ts`
  - research 搜索候选重排与信息提取专项测试通过
- Chrome 真机手测
  - `public_research` 闭环通过，`user-reported`
  - `commerce_search` 闭环通过，`user-reported`
- 自动化真机附着验证
  - 已尝试附着现有浏览器与新拉起 Chrome
  - 当前未能稳定拿到项目扩展上下文，记录为 blocker

时间：`2026-04-07`

## 5. Remaining Risks

当前主要剩余风险：

- stop / error / budget guardrails 仍缺真机可视化验证记录
- provider live request 仍缺真实环境验证
- 目前仍不支持执行中动态改 plan
- research 第一页候选重排序已落地，但尚缺“重排前后成功来源命中率”记录
- 自动化真机扩展会话验证仍被浏览器扩展附着条件阻塞

## 6. Rejected Paths

本轮明确放弃：

- 继续保留旧 alias tool
- 继续让 runtime 维护 `phase` 兼容逻辑
- 为了形式整齐继续堆中间抽象
- 在没有真实证据前继续细拆 tool

## 7. Next Actions

1. 记录 stop / error / budget guardrails 真机表现
2. 记录 research 第一页重排前后的成功来源命中率
3. 提升第一页候选的基础质量，而不是先把有效来源目标提到 5
4. 打通自动化真机扩展验证链路
5. 根据新增真实失败模式决定是否继续细拆 tool 或扩展 PDF artifact

## 8. 2026-04-08 补充

### 8.1 research 页面输入现状

- `src/content/research.ts`
  - research 来源页提取已改为 `Readability 优先 + fallback`
  - 页面输入不再以 `summary + keyPoints` 为主
  - 当前主输入已收口为 `pageTitle + bodyExcerpt + textLength + extractionStrategy`
- `src/background/tools/read-research-source-facts.ts`
  - research source 记录已改为保存 `bodyExcerpt`
- `src/background/prompting.ts`
  - 最终汇总 prompt 已明确将 `bodyExcerpt` 视为主证据正文
- `src/sidepanel/index.ts`
  - 运行详情与本地提取样本区已改为展示正文片段，而不是摘要/要点

### 8.2 本轮最小验证

- `npx.cmd vitest run tests/public-research.test.ts tests/research-search-quality.test.ts tests/sidepanel.test.ts tests/schema.test.ts`
  - 4 个测试文件，22 个测试通过
- `npm.cmd run build`
  - 通过

### 8.3 当前新增风险

- research 页面正文虽然已切到 `bodyExcerpt`，但“前部截断是否总是最佳证据段”仍需人工样本继续验证

Updated: 2026-04-08
