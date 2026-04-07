# Browser Agent 状态检查点

## 1. Current Phase

`implementation`

## 2. Current Focus

当前主线已经进入“范式迁移落地”的收口阶段：

- Runtime 按 `PlanStep + allowedTools` 驱动
- Tools 由 LLM 在当前 step 的 `allowedTools` 内选择
- Runtime 最小护栏先落了“执行步数 + 运行时间”
- Side Panel 已切到 `对话 | 运行状态 | 结果`

## 3. Done

- `src/background/prompting.ts` / `src/background/llm-client.ts`
  - final answer synthesis now uses one generic structured prompt entrypoint
  - the LLM final output is no longer tied to separate hardcoded commerce and research prompt templates
- `src/sidepanel/index.ts`
  - results now render final markdown first for both task modules
  - structured items, sources, and unresolved issues are shown as optional supplemental blocks

- `src/shared/types.ts`
  - 已落地 `PlanStep`
  - `SessionMemory.plan` / `SessionPublicState.plan` 已切到结构化步骤
  - `StepRecord` 已记录所属 `planStepId`
- `src/background/runtime.ts`
  - 已移除旧的 `phase -> tool` 主调度逻辑
  - 已改为按当前 `PlanStep.allowedTools` 选择 tool
  - 已落最小护栏：
    - `softStepLimit = 15`
    - `softElapsedMs = 120000`
    - `maxTotalSteps = 20`
    - `maxElapsedMs = 180000`
  - 异常或手动停止时会补结构化终态结果
- `src/background/tools.ts`
  - 已与新的 `PlanStep[]` 内存契约对齐
  - 高层 step 计数已收回 runtime 统一维护
- `src/sidepanel/index.ts`
  - 已改成三段式展示：
    - 对话
    - 运行状态
    - 结果
  - 执行时间线已按计划步骤正序分组展示
  - 调试日志已改为正序展示
- 自动化验证
  - `npm.cmd test` 通过
  - `npm.cmd run build` 通过

## 4. Real-World Validation

本线程已有用户实机反馈：

- 扩展可加载
- Side Panel 可启动 session
- `public_research` 路径已跑通

实机反馈同时暴露了一个 UI 问题：

- 执行时间线之前把步骤细节直接拼在计划步骤后面，且展示顺序为倒序
- 本轮已按“计划步骤分组 + 步骤细节内聚 + 正序展示”修正

## 5. In Progress

- 继续把高层 tool 返回契约从过渡态收口到最终形态
- 继续减少 tools 内对 `currentPhase` 的兼容依赖
- 准备补 `no progress` / 连续失败类护栏

## 6. Blockers

- 高层 `ToolResult` 仍处于过渡态，尚未完全统一成最终协议
- `no progress` 护栏未落地
- `commerce_search` 还缺本线程内的实机闭环验证记录
- provider live request 仍未做真实联调确认

## 7. Rejected Paths

- 不先把来源读取和事实提取硬拆成更细 tool
- 不为了迁移去做无关重构、重命名和大面积改写
- 不把 raw DOM 原子动作暴露给 LLM 编排

## 8. Next Actions

1. 统一高层 tool 返回契约，减少 phase 兼容字段
2. 补 `no progress` / 连续失败类护栏
3. 补 `commerce_search` 真机闭环验证
4. 根据真机反馈决定是否继续细拆 tool

Updated: 2026-04-03
