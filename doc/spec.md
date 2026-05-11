# Browser Agent 设计规范

## 1. 定位

本文记录当前设计真相、组件边界和不变量。

代码级协议由实现负责。优先查看：

- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/shared/browser-capability.ts`
- `src/background/runtime/runtime-core.ts`
- `src/background/runner/`
- `src/background/browser/`
- `src/content/core/`
- `src/shared/browser-core/`

## 2. 产品目标

产品目标：

`大众用户可用的通用浏览器 Agent`

核心模型：

`Agent = LLM + Tools + Memory + Runtime`

执行模型：

`LLM-driven bounded plan + thin runner over Store-safe Browser Core V2`

## 3. 架构

- `LLM` 负责目标理解、bounded planning、tool choice、round decision 和 final synthesis。
- `Tools` 暴露稳定语义能力，并封装等待、恢复、重试、裁剪和结构化返回。
- `BrowserCapabilityLayer` 是浏览器控制底座，默认走 store-safe JS/DOM observe/read/extract。
- `Runtime` 负责 session 生命周期、预算、停止、状态广播和终态兜底。
- `Thin Runner` 校验每轮 bounded plan、调度 tools、聚合结果并更新 state。
- `Memory` 保留结构化工作记忆，优先级低于 tool 和 runtime 稳定性。

## 4. 执行流程

1. 用户给出目标。
2. Runtime 创建 session，并注入上下文、权限状态和安全边界。
3. LLM 为当前子目标生成 bounded plan，通常为 1-5 个 action。
4. Thin Runner 校验 schema、tool allowlist、ToolRegistry metadata、前置条件、预算和风险等级。
5. Thin Runner 调度 tools。
6. Tools 返回短、结构化、带来源或失败解释的结果。
7. LLM 基于更新后的 state 决定 `finalize / replan / abort`。
8. Runtime 应用 stop、loop guard、状态广播和终态兜底。
9. 终态结果为 `success / partial / failed / blocked`。

这里的 plan 是当前轮局部计划，不是持久 workflow engine。

## 5. 任务语义

当前任务语义：

- `direct_answer`
- `commerce_search`
- `public_research`
- `site_overview`

它们是任务语义、adapter、skill 或 harness 表面。产品架构由 Browser Core V2 边界定义。

## 6. 组件边界

### LLM

LLM 负责：

- 理解用户目标；
- 生成 bounded plan；
- 在授权 tools 内做选择；
- 判断证据是否足够；
- 汇总最终结果并说明边界。

LLM 不负责：

- raw DOM 动作；
- selector、等待、滚动、坐标或重试细节；
- 绕过权限；
- 伪造来源；
- tool 局部恢复。

### Tools

Tools 负责：

- 稳定语义能力；
- 调用 `BrowserCapabilityLayer`；
- 等待、恢复、fallback、裁剪和结构化；
- 返回短且可合并的 `ToolResult`。

Tools 不负责：

- 维护全局 workflow 脑子；
- 改写产品目标；
- 向 LLM 暴露 raw DOM 指令。

### BrowserCapabilityLayer

`BrowserCapabilityLayer` 负责浏览器控制抽象。

当前覆盖方向：

- tab lifecycle；
- navigation / reload / wait；
- content-script JS/DOM snapshot；
- click / type / keyboard；
- controlled evaluate subset；
- stale reference recovery；
- content trimming 和 metadata extraction。

`CdpDriver` 是 advanced/local/enterprise driver。

### Runtime

Runtime 是最小保障层。

Runtime 负责：

- session 生命周期；
- plan schema 和 ToolRegistry metadata 校验；
- 确定性调度；
- token / step / time budget；
- stop / takeover / blocked；
- loop guard；
- 状态广播和终态兜底。

Runtime 不负责：

- 业务 workflow 语义；
- 任务级语义决策；
- 浏览器局部恢复；
- 持久 DAG 生成。

### Memory

Memory 保留结构化工作记忆：

- 用户偏好；
- 任务目标；
- 关键来源；
- 稳定事实；
- 可复用失败模式。

## 7. 不变量

- runtime-visible tool result 必须可结构化消费。
- content script 和低层 action result 是实现细节。
- LLM 只在授权 tools 和安全边界内行动。
- 每轮 bounded plan 默认 1-5 个 action。
- runtime-visible tools 必须带 schema、side effect、parallel policy、requires、produces 和 handler metadata 注册。
- Tools 在可行时做局部恢复，无法恢复时返回可解释失败。
- 终态结果始终是 `success / partial / failed / blocked`。
- 只有用户明确要求时才产出 documentation artifacts。

## 8. UI 契约

Side Panel 应展示：

- 当前目标；
- 当前使用的能力；
- 关键来源和关键失败；
- stop、takeover、retry 入口；
- 高风险 action 确认。

UI 展示当前链路状态，路由决策留给 runtime 和 LLM 边界。

更新日期：2026-05-11
