# Work Thread

## 1. 基本信息

- Thread: `work-plan-driven-runtime-migration`
- Status: `DOING`
- Owner: `Codex + user`
- Related taskModule: `commerce_search / public_research`
- Updated: 2026-04-03

## 2. Scope

- 本线程要落地什么：
  - 把当前主链从旧的 `phase-driven deterministic loop` 迁到 `LLM plan-driven tool orchestration`
  - 补最小 runtime 护栏
  - 同步收口 side panel 展示
- 本线程只负责什么：
  - 当前两条已跑通模块的迁移收口
  - `PlanStep + allowedTools` 执行循环
  - UI 的 `对话 | 运行状态 | 结果` 三段式展示
- 本线程不负责什么：
  - 执行中复杂 plan 改写
  - raw DOM 动作直接开放给 LLM
  - 新任务模块扩展
  - 下单/支付等高风险执行

## 3. Dependency

- `doc/spec.md`: 当前执行范式为 `LLM plan-driven tool orchestration`
- `doc/constraints.md`: 不继续堆固定 workflow，不把 raw DOM 暴露给 LLM
- `doc/plan.md`: 先切范式，再逐步收口工具边界
- `doc/status.md`: 当前已进入实现收口阶段
- `doc/acceptance.md`: 当前自动化验证通过，`public_research` 实机已通过

## 4. Facts

- 已确认事实：
  - Runtime 已按 `PlanStep + allowedTools` 驱动
  - tools 已由 LLM 在当前 step 的 `allowedTools` 内选择
  - 最小护栏已先落“执行步数 + 运行时间”
  - side panel 已切到 `对话 | 运行状态 | 结果`
  - 时间线已改为按计划步骤正序分组展示细节
  - 当前改动已并入 `main`
- 证据：
  - `src/background/runtime.ts`
  - `src/background/tools.ts`
  - `src/sidepanel/index.ts`
  - `README.md`
  - `doc/status.md`
  - `doc/acceptance.md`
- 影响：
  - 新旧工具名现在通过兼容别名共存
  - 自动化测试与当前 `main` 分支状态已重新对齐
  - side panel 现在更接近调试/观察用途，而不是旧 phase 面板

## 5. Current Approach

- 当前方案：
  - 保留现有主链能力
  - 先以最小必要改动切换 runtime 范式
  - 用兼容别名承接 `main` 上已有的粗颗粒 tool 名
  - 在不大改工具内部实现的前提下先走通新循环
- 为什么这是最小必要改动：
  - 不需要先细拆来源读取与事实提取
  - 不需要同时重写 runtime、tools、UI 和全部测试契约
  - 可以在保留旧实现主体的前提下完成新范式迁移
- 当前方案依赖什么前提：
  - 当前任务模块仍限定在 `commerce_search / public_research`
  - 高层 tool 仍允许保留少量过渡态 phase 兼容字段

## 6. Progress

- Done:
  - `PlanStep` 已落地
  - runtime 已改为按当前 step 的 `allowedTools` 选 tool
  - 最小护栏已实现：
    - `softStepLimit = 15`
    - `softElapsedMs = 120000`
    - `maxTotalSteps = 20`
    - `maxElapsedMs = 180000`
  - stop/error 路径已补结构化终态结果
  - side panel 已收口为 `对话 | 运行状态 | 结果`
  - 执行时间线已按计划步骤分组，日志已改正序
  - README / status / acceptance 已同步
  - 当前内容已合并到 `main`
- In Progress:
  - 高层 tool 返回契约继续收口
  - 减少内部对 `currentPhase` 的兼容依赖
- Blockers:
  - `no progress / 连续失败` 护栏未落地
  - `commerce_search` 缺本线程内的实机闭环记录
  - provider live request 未做联调确认

## 7. Verification

- 已验证：
  - `npm.cmd test`
  - `npm.cmd run build`
  - 用户实机反馈：当前线程下实机测试通过
- 结果：
  - `9` 个测试文件、`47` 个测试通过
  - 构建通过，`dist/` 正常产出
  - `public_research` 实机链路已跑通
- 未验证：
  - `commerce_search` 本线程内实机闭环
  - `stop / error` 路径的实机展示
  - Gemini / DeepSeek provider 的专门联调
- 原因：
  - 本轮优先收口范式迁移主链与 UI 展示

## 8. Next Actions

1. 补 `no progress / 连续失败` 护栏
2. 记录 `commerce_search` 的实机闭环结果
3. 决定是否继续把高层 tool 契约从兼容态收口到最终命名

## 9. Handoff

- 当前停在哪一步：
  - 范式迁移主链已完成一轮收口，当前停在“护栏补完 + 补齐实机验收”
- 接手后先看什么：
  - `src/background/runtime.ts`
  - `src/background/tools.ts`
  - `src/sidepanel/index.ts`
  - `doc/status.md`
  - `doc/acceptance.md`
- 不要重复做什么：
  - 不要再把时间线退回成“计划步骤 + 倒序细节拼接”
  - 不要为了继续迁移先强拆 `readResearchSourceFacts`
  - 不要把 raw DOM 动作开放给 LLM

## 10. Related Files

- `src/background/runtime.ts`
- `src/background/tools.ts`
- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/sidepanel/index.ts`
- `public/sidepanel.css`
- `README.md`
- `doc/status.md`
- `doc/acceptance.md`

Updated: 2026-04-03

## 11. Latest Checkpoint

- Date: `2026-04-07`
- Scope completed in this checkpoint:
  - landed V1 lightweight `semanticSnapshot`
  - landed V1 deterministic recovery paths
    - wait-and-rescan
    - one-shot dialog close
    - one-shot canonical search reopen
    - single-source skip for `public_research`
- Validation:
  - `npm.cmd test`: `9` test files, `56` tests passed
  - `npm.cmd run build`: passed
- Current state:
  - both `commerce_search` and `public_research` remain runnable
  - runtime keeps the `PlanStep + allowedTools` loop
  - current `allowedTools` contract still exists, but most current steps are still single-tool in practice
- Remaining follow-up:
  - `no progress / repeated failure` guardrails
  - `commerce_search` real-world verification record
  - provider live validation and `stop / error` UI verification

Updated: 2026-04-07
