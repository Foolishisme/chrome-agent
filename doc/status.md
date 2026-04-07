# Browser Agent 状态检查点

## 1. Current Phase

`implementation`

## 2. Current Focus

当前主线已经从“过渡层迁移”切到“canonical v1 收口完成后的稳定化”：

- Runtime 已是 canonical plan loop
- Tools 已按 `src/background/tools/` 拆分
- 状态模型、tool 契约、最终输出契约已统一
- Side Panel 已改为读取 `finalResult`

## 3. Done

### 3.1 协议

- `src/shared/types.ts`
  - canonical `ToolName` 已收口
  - `ActionResult` / 高层 `ToolResult` 已分离
  - `FinalResult` 已统一
  - `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 已退出主链

- `src/shared/schema.ts`
  - `nextToolSelectionSchema` 只允许 canonical tool
  - `finalResultSynthesisSchema` 已对齐新 `FinalResult`
  - `actionResultSchema` 已替代旧 action-level `ToolResult`

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

### 3.3 UI

- `src/sidepanel/index.ts`
  - 结果区优先展示 `finalResult.markdown`
  - 问题与建议下一步从 `finalResult` 读取
  - 不再依赖 `currentPhase`

- `src/sidepanel/i18n.ts`
  - runtime 状态已收口为 `idle | running | done | error`

### 3.4 文档

- `doc/adr/0002-converge-runtime-tool-contracts.md` 已新增
- `spec / constraints / plan / status / acceptance` 已对齐当前代码事实

## 4. Validation

最新验证检查点：

- `npm.cmd test`
  - 9 个测试文件，60 个测试通过
- `npm.cmd run build`
  - 通过

时间：`2026-04-07`

## 5. Remaining Risks

当前主要剩余风险：

- `commerce_search` 仍缺本轮真机闭环记录
- stop / error / budget guardrails 仍缺真机可视化验证记录
- 目前仍不支持执行中动态改 plan
- `artifacts` 字段协议已固定，但真实文件 artifact 仍未进入主链

## 6. Rejected Paths

本轮明确放弃：

- 继续保留旧 alias tool
- 继续让 runtime 维护 `phase` 兼容逻辑
- 为了形式整齐继续堆中间抽象
- 在没有真实证据前继续细拆 tool

## 7. Next Actions

1. 记录 `commerce_search` 真机闭环
2. 记录 stop / error / budget guardrails 真机表现
3. 根据真实失败模式决定是否继续细拆 tool
4. 再评估文件 / PDF artifact 主链

Updated: 2026-04-07
