# Browser Agent 设计规范

## 1. 文档定位

本文档只记录当前仍成立的设计真相、边界和不变量。

本文档不记录：
- 迁移过程叙事
- 已完成事项流水
- 过期 workflow 细节
- 可直接从代码读取的字段级协议

代码级协议以实现为准，优先查看：
- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/shared/browser-capability.ts`
- `src/background/runtime/runtime-core.ts`
- `src/background/runner/`
- `src/background/browser/`
- `src/content/core/`
- `src/shared/browser-core/`

## 2. 当前目标

产品目标：
`大众用户可用的通用浏览器 Agent`

核心定义：
`Agent = LLM + Tools + Memory + Runtime`

当前目标执行范式：
`LLM-driven bounded plan + thin runner over Store-safe Browser Core V2`

## 3. 当前架构

- `LLM` 负责目标理解、子任务拆分、工具选择、轮次决策和最终汇总。
- `Tools` 负责稳定语义能力，内部封装等待、恢复、重试、裁剪和结构化。
- `BrowserCapabilityLayer` 负责浏览器控制底座，默认走 store-safe JS/DOM observe/read/extract 路线。
- `Runtime` 负责 session 生命周期、预算、停止、状态广播和最终兜底。
- `Thin Runner` 负责校验每轮 bounded plan、调度工具、聚合结果和更新 state。
- `Memory` 仅保留结构化工作记忆，不作为当前第一优先级差距。

## 4. 执行流程

默认流程：

1. 用户给出目标。
2. Runtime 创建 session，并注入上下文、权限状态和安全边界。
3. LLM 为当前子目标生成一轮 bounded plan，通常为 1-5 个 action。
4. Thin Runner 校验 schema、工具白名单、工具 metadata、前置条件、预算和风险等级。
5. Thin Runner 调度工具执行；工具内部负责等待、恢复、裁剪和结构化。
6. Tool result 以短、结构化、带来源的形式写回 state。
7. LLM 基于更新后的 state 决定 `finalize / replan / abort`。
8. Runtime 负责 stop、loop guard、状态广播和最终结果兜底。
9. 最终结果统一表达为 `success / partial / failed / blocked`。

这里的 plan 指当前轮局部计划，不是长期持久化 workflow 引擎。

## 5. 任务与模块定位

现有任务语义：
- `direct_answer`
- `commerce_search`
- `public_research`
- `site_overview`

当前定位：
- 它们可以继续作为任务语义、adapter、skill 或 harness 存在。
- 它们不是当前主架构设计的来源，也不是主文档的中心。
- 当前主验收以 Browser Core V2 分层场景为准，详见 `doc/acceptance.md`。

## 6. 组件边界

### 6.1 LLM

LLM 负责：
- 理解用户目标
- 生成 bounded plan
- 在已授权工具范围内做轮次决策
- 判断证据是否足够
- 汇总结果并说明边界

LLM 不负责：
- raw DOM 动作
- selector、等待、滚动、点击坐标和重试细节
- 绕过工具权限或安全边界
- 伪造来源
- 工具内部局部恢复

### 6.2 Tools

Tools 负责：
- 暴露稳定语义能力
- 调用 `BrowserCapabilityLayer`
- 封装等待、恢复、fallback、裁剪和结构化
- 返回短、可合并的 `ToolResult`

Tools 不负责：
- 维护全局 workflow 脑子
- 改写产品级目标
- 把内部动作拆成 raw DOM 指令交给 LLM

### 6.3 BrowserCapabilityLayer

`BrowserCapabilityLayer` 是浏览器控制抽象，默认不依赖 `debugger` / CDP。

当前覆盖方向：
- tab lifecycle
- navigation / reload / wait
- content-script JS/DOM snapshot
- click / type / keyboard
- 受控 evaluate 子集
- stale reference 恢复
- 页面内容裁剪和元信息提取

`CdpDriver` 只作为 advanced/local/enterprise driver。

### 6.4 Runtime

Runtime 是最小保障层。

Runtime 负责：
- session 生命周期
- plan schema 与工具 metadata 校验
- 确定性调度
- token / step / time budget
- stop / takeover / blocked
- loop guard
- 状态广播和最终兜底

Runtime 不负责：
- 编写业务 workflow 语义
- 代替 LLM 做任务级决策
- 代替工具做浏览器局部恢复
- 生成长期 DAG 或 workflow engine

### 6.5 Memory

Memory 只保留结构化工作记忆：
- 用户偏好
- 任务目标
- 关键来源
- 稳定事实
- 可复用失败模式

Memory 当前后置。

## 7. 协议不变量

- runtime-visible tool result 必须可结构化消费。
- 内容脚本或底层原子动作结果不等于最终 tool result。
- LLM 只能在授权工具和安全边界内行动。
- 每轮 plan 默认限制为 1-5 个 action；超限必须 replan 或拆分。
- runtime-visible tool 必须带 metadata 注册，至少包含 schema、side effect、parallel policy、requires、produces 和 handler。
- 工具内部错误应尽量恢复；无法恢复时返回可解释失败。
- 最终结果必须统一表达为 `success / partial / failed / blocked`。
- 文档 artifact 不是默认输出；只有用户明确要求时才生成。

## 8. UI 契约

Side Panel 应表达：
- 当前目标
- 当前正在使用的能力
- 关键来源和关键失败
- 可停止、可接管、可重试
- 高风险动作需要确认

UI 展示当前链路状态，不展示历史迁移叙事。

Updated: 2026-04-29
