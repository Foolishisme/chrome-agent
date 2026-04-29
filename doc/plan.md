# Browser Core V2 Controlled Rebuild Plan

## 1. 定位

本文档是当前 active migration plan。

当前核心任务：
`在现有仓库内受控重建 Browser Core V2，优先用 store-safe JS/DOM 能力和 bounded plan + thin runner 跑通主链，再把 CDP/debugger 保持为 advanced/local/enterprise driver。`

## 2. 当前 checkpoint

当前已成立：
- 默认 runtime 主链已切到 `Browser Core V2 runtime loop`
- 首批 runtime-visible tool 契约已冻结并接入主链
- 非 `direct_answer` 任务已支持 `execute round -> decideRoundAction -> finalize | replan | abort`
- 旧 runtime loop 和旧 chooser path 已退出 active code path
- legacy finalizer / candidate filter 已收口为两个 adapter：
  - `finalize-task-result`
  - `prepare-task-candidates`

当前仍未完成：
- 通用 `RoundPlanSchema` runner
- 最终 `StoreSafeDriver` wiring
- 基于真浏览器的 S1/S2/S3 事实闭环
- `skill.commerceResearch` 的 legacy helper 依赖收缩

## 3. 接下来只做什么

下一阶段只推进这些事：

1. 把当前 task-family-specific executor 提升为通用 `RoundPlanSchema` runner。
2. 保持 `open / observe / read / extract` 在 Browser Core V2 内部，不直接暴露给 LLM。
3. 继续补 Browser Core V2 tool 内部恢复、裁剪、批量读取和失败语义。
4. 推进 `StoreSafeDriver`，把当前运行时浏览器适配层收敛到最终 chrome wiring。
5. 在真浏览器里验证：
   - `public_research`
   - `site_overview`
   - `commerce_search`
   的 `finalize / replan / abort` 轮次关口。

## 4. 当前阶段拆分

### Phase 0 - Core Contract and Mock Harness

状态：`DONE`

结果：
- `BrowserCapabilityLayer` / `BrowserDriver` contract 已建立
- mock driver 与最小测试夹具已建立

### Phase 1 - Browser Core V2 File Framework and Store-safe Facade

状态：`DONE`

结果：
- `src/browser-core-v2/` 隔离目录已建立
- 首批 Browser Core V2 facade / tools / runner 基础已落地

### Phase 2 - Bounded Plan Runner and Agent Loop V2 Minimal

状态：`PARTIAL`

本阶段剩余重点：
- 从“按任务类型硬编码执行器”提升为“按每轮 plan 通用执行”
- 保持当前两轮 bounded loop，不扩成重型 workflow engine
- 把当前 adapter 继续向稳定边界收口，而不是继续往旧链路补丁

### Phase 3 - Tool Hardening

状态：`NEXT`

目标：
- 强化 store-safe 工具厚度：恢复、重试、stale target、page problem、result trimming
- 增加一跳读取、受限并发和 partial success
- 增加 mock / unit / integration tests

### Phase 4 - Low-risk Interaction

状态：`LATER`

目标：
- 实现 click / type / press / scroll 的低风险子集
- 加入 action risk gate

### Phase 5 - Advanced Drivers

状态：`LATER`

目标：
- 实现 `CdpDriver`
- 仅作为 advanced/local/enterprise driver

## 5. 第一闭环

当前第一闭环仍是：
`explicit_url overview via bounded plan runner + StoreSafeDriver`

它对应 `doc/acceptance.md` 的 S1，是当前 Browser Core V2 的第一主验收。

## 6. 不做事项

当前阶段不优先做：
- 重写整个 runtime shell
- 重新引入旧 workflow 主链
- 引入重型 DAG / LangGraph / Temporal
- 向 LLM 暴露原子 DOM 工具
- 默认依赖 `debugger` / CDP
- 默认 `<all_urls>`
- memory 长期化、subagent 产品化、cron/channel、Google identity/Gmail/Drive
- 高风险真实账号自动化

## 7. Revisit Trigger

出现以下情况时重评本计划：
- `StoreSafeDriver` 无法支撑 explicit URL overview 的最低可用质量
- 通用 round runner 无法在不依赖 CDP 的前提下稳定完成主链
- 页面裁剪和结构化仍不能显著降低 LLM 噪音
- 新主链仍被 legacy helper 结构严重拖住
- contract 频繁震荡，集成成本高于收益

Updated: 2026-04-29
