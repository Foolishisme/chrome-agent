# 浏览器 Agent 状态 (Browser Agent Status)

## 当前阶段 (Current Phase)

`browser-core-v2-controlled-rebuild` (Browser Core V2 受控重构)

## 当前检查点 (Current Checkpoint)

默认运行时路径现在是：

`启动会话 (START_SESSION) -> BrowserAgentRuntime 壳 -> Browser Core V2 运行时循环`

旧的 workflow 循环不再是主执行路径。

当前的非直接 (non-direct) 执行形态为：

`任务规范 (taskSpec) -> 有界轮次执行器 (bounded round executor) -> 判定轮次动作 (decideRoundAction) -> 完成 (finalize) | 重新规划 (replan) | 中止 (abort)`

`直接回答 (direct_answer)` 仍然绕过此关口并立即完成。

## 当前在线功能 (What Is Live Now)

- `BrowserAgentRuntime` 仍然负责会话生命周期、发布、停止、存档和错误处理。
- 会话引导现在以 `taskSpec` 为先。启动阶段会编译出一个稳定的 `taskSpec`，并为侧边栏构建一个粗粒度的展示计划。
- 默认的 Browser Core V2 运行时循环按任务族 (task family) 进行分发，不再使用旧的 `allowedTools -> chooseToolForStep -> getToolDefinition()` 路径。
- 第一方 LLM 可见工具协议已冻结，并接入 Browser Core V2 运行时路径：
  - `browser.search`
  - `browser.webDetail`
  - `browser.siteOverview`
  - `skill.commerceResearch`
- 当前的非直接循环现在支持有界的第二轮执行：
  - 执行一轮粗粒度工具调用
  - 从候选者 / 来源 / 条目 / 问题中构建共享的轮次证据 (round evidence)
  - 调用 `decideRoundAction`
  - 选择 `finalize`、`replan` 或 `abort`
- 遗留的完成器 (finalizer) / 过滤器 / 辅助逻辑现在通过 Browser Core V2 适配器汇聚：
  - `finalizeTaskResult`
  - `preparePublicResearchCandidates`
  - `prepareSiteOverviewCandidates`
  - `prepareCommerceCandidates`
- `电商搜索 (commerce_search)` 已经接入新运行时路径，但其技能委派 (skill delegate) 在内部仍复用了遗留的搜索辅助工具。

## 当前任务路径 (Current Task Paths)

- **直接回答 (direct_answer)**
  - `finalizeTaskResult`

- **公开调研 (public_research)**
  - `browser.search`
  - `prepareTaskCandidates`
  - `browser.webDetail` 批量执行
  - `decideRoundAction`
  - `finalizeTaskResult` 或进入第 2 轮

- **站点概览 (site_overview)**
  - 仅在必须解析官方入口时调用 `browser.search`
  - `browser.siteOverview`
  - `decideRoundAction`
  - `finalizeTaskResult` 或进入第 2 轮

- **电商搜索 (commerce_search)**
  - `skill.commerceResearch`
  - `decideRoundAction`
  - `finalizeTaskResult` 或进入第 2 轮

## 复用自遗留代码的部分 (What Was Reused From Legacy Code)

- 来自 `direct_answer / public_research / site_overview / commerce_search` 的任务族语义
- 任务编译以及路由/查询优化 (route/query refinement)
- 结果构建器 (result builders) 和调研来源读取
- 电商技能委派内部仍在使用的遗留搜索/打开辅助工具

这些现在作为适配器或助手存在，不再是主运行时循环。

## 不再适用的情况 (What Is No Longer True)

- 旧的运行时循环不再是主链。
- 旧的运行时循环文件和旧的选择器路径不再属于活跃代码路径。
- 非直接任务并不总是工具执行一轮后立即完成。
- `status.md` 应被视为当前的快照，而非仅增量的进度日志。

## 主要差距 (Main Gaps)

- 当前的重新规划 (replanning) 模型仍然是粗粒度的：
  - 它只是修补当前的 `taskSpec`
  - 尚未运行通用的 `RoundPlanSchema`
  - 尚未支持来自 LLM 的任意多步骤单轮计划
- 当前的 Browser Core V2 浏览器驱动程序仍然是封装以下内容的运行时适配器：
  - `chrome.tabs`
  - `waitForTabComplete`
  - `sendMessageToTab`
  - 内容桥接 (content-bridge) 动作
- 作为最终 Chrome 接入目标的 `StoreSafeDriver` 仍待处理。
- 针对新的多轮关口的真实浏览器 S1/S2/S3 风格验证尚未成为事实来源检查点。
- `skill.commerceResearch` 仍依赖于遗留的委派助手，而非全原生的 Browser Core V2 实现。
- `query-compiler.ts` 已经过清理，足以保持新链条正常运行，但它仍携带了基于规则的路由启发式逻辑，这些逻辑最终应在新的规划器边界周围进行简化。

## 当前风险 (Current Risks)

- 新的多轮关口改善了控制流，但执行器仍是特定于任务族的。它还不是一个完全通用的有界规划器。
- 重新规划仅修改当前任务族内的字段。它还无法在工具模式之间进行更丰富的策略转移。
- 由于当前的浏览器驱动程序仍是适配器，真实浏览器的稳定性可能与 Mock / 集成测试结果有所不同。
- 遗留的辅助文件仍存在于新适配器边界之外，因此未来的清理工作应继续仅删除死代码，避免过早移除仍被依赖的活跃助手。

## 下一步建议 (Next Recommended Step)

1. 将当前的轮次结束决策模型提升为显式的有界 `RoundPlanSchema`。
2. 从特定于任务族的执行器转向通用的单轮计划运行器 (per-round plan runner)。
3. 将 `打开 / 观察 / 读取 / 提取 (open / observe / read / extract)` 保留在 Browser Core V2 内部；不要将它们直接暴露给 LLM。
4. 在真实浏览器会话中验证以下任务的“完成或重新规划”关口：
   - `公开调研 (public_research)`
   - `站点概览 (site_overview)`
   - `电商搜索 (commerce_search)`
5. 减少 `skill.commerceResearch` 中剩余的遗留依赖。

## 最新验证 (Latest Validation)

- **通过：**
  - `npm test -- tests/query-compiler.test.ts tests/runtime.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/llm-client.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/runtime-bootstrap.test.ts tests/sidepanel.test.ts tests/research-search-quality.test.ts tests/runtime-tools.test.ts`
  - `npm run build`
  - `npx tsc --noEmit`

更新时间：2026-04-22

