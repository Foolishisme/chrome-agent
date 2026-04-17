# Browser Agent 设计规范

## 1. 文档定位

本文档只记录当前仍成立的设计真相、边界和不变量。

本文档不记录：

- 字段级接口复刻
- 某次迁移过程
- 已完成事项流水
- 过期 workflow 细节

代码可直接查到的协议细节，以代码为准：

- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/background/tools/registry.ts`
- `src/background/runtime-core.ts`

旧阶段快照已归档到 `doc/history/2026-04-17-general-browser-agent-shift/`。

## 2. 核心定义

产品目标：

`大众用户可用的通用浏览器 Agent`

核心定义：

`Agent = LLM + Tools + Memory + Runtime`

目标执行范式：

`LLM-driven browser tool loop over a thick BrowserCapabilityLayer`

含义：

- `LLM` 是目标理解、子任务拆分、工具选择、取舍和汇总的决策核心。
- `Tools` 是稳定语义能力单元，负责把浏览器脏活封装成可靠能力。
- `BrowserCapabilityLayer` 是浏览器控制底座，封装 tab、navigation、snapshot、screenshot、click、type、evaluate、等待、重试和 fallback。
- `Runtime` 是最小执行保障层，负责 session 生命周期、预算、停止、状态广播、结果记录和最终兜底。
- `Memory` 是结构化工作记忆，但不是当前第一差距；第一差距在 tools、恢复、裁剪和批量观察。

当前代码仍保留 `LLM plan-driven tool orchestration`。该实现是过渡基线，不再代表长期产品边界。

## 3. 顶层设计目标

系统设计优先满足：

- 通用浏览：能围绕用户目标搜索、打开、阅读、跳转、比较、汇总和执行低风险页面动作。
- 工具可靠：等待、重试、fallback、页面裁剪和错误恢复优先封装在 tool 内。
- LLM 少量高价值决策：LLM 不做每个 DOM 细节，只做目标理解、选择、判断、汇总和必要的下一步决策。
- 过程可接管：用户能看到正在做什么，能停止、接管或拒绝高风险动作。
- 结果可追溯：最终输出保留来源、覆盖边界、失败原因和下一步建议。

完整设计原则放在 `doc/reference/design_principles.md`，仅在架构取舍、模块拆分、抽象边界或文档系统调整时按需查阅。

## 4. 执行流程

通用浏览器 Agent 的默认流程：

1. 用户给出目标。
2. Runtime 创建 session，注入时间、上下文、权限状态和安全边界。
3. LLM 形成轻量工作假设：需要搜索、读取、比较、操作还是直接回答。
4. LLM 调用稳定 tool；一次 turn 可以包含多个工具调用。
5. Tools 通过 `BrowserCapabilityLayer` 执行浏览器动作，并在内部处理等待、重试、fallback、裁剪和结构化。
6. Tool result 以短、结构化、带来源的形式回到上下文。
7. LLM 基于结果决定继续搜索、打开页面、读取更多、停止或汇总。
8. Runtime 负责预算、停止、循环检测和最终兜底。
9. 最终结果统一表达 `success / partial / failed / blocked`。

大任务可以被 LLM 拆成搜索关键词、候选页面、子问题或并行读取批次。这里的 plan 是工作假设，不是必须长期持久化的 workflow 引擎。

## 5. Workflow 定位

现有模块：

- `direct_answer`
- `commerce_search`
- `public_research`
- `site_overview`

新的定位：

- 它们是验证浏览器能力的 harness。
- 它们是可沉淀为 skill/tool 的任务模式。
- 它们不是长期产品边界。
- 它们不应阻止系统走向多站点、通用页面阅读和低风险页面操作。

`site_overview explicit_url` 仍是第一迁移实验，因为它能最小化业务变量，直接验证 CDP snapshot、页面裁剪、导航恢复和最终汇总质量。

## 6. 组件边界

### 6.1 LLM

LLM 负责：

- 理解用户目标。
- 生成轻量子任务、搜索关键词和候选策略。
- 在可用工具范围内选择下一步。
- 判断证据是否足够。
- 汇总结果、说明边界和提出下一步建议。

LLM 不负责：

- raw DOM 动作。
- selector、等待、滚动、点击坐标和重试细节。
- 绕过工具权限。
- 伪造事实来源。
- 替 tool 执行局部恢复。

### 6.2 Tools

Tools 负责：

- 暴露稳定语义能力。
- 调用 `BrowserCapabilityLayer`。
- 封装等待、恢复、fallback、裁剪、批量读取和结构化。
- 返回短、可信、可合并的 `ToolResult`。

Tools 不负责：

- 维护全局 workflow 脑子。
- 改写产品目标。
- 把内部动作拆成一串 raw DOM 指令交给 LLM。

### 6.3 BrowserCapabilityLayer

`BrowserCapabilityLayer` 是下一阶段最重要的抽象。

它应覆盖：

- tab open / close / focus / lifecycle
- navigation / reload / wait
- DOM or accessibility snapshot
- screenshot
- click / type / keyboard
- page evaluate 的受控子集
- stale reference 恢复
- attach / reattach / fallback
- 页面内容裁剪和元信息提取

ChromeClaw 的 CDP/browser tool 是主要参考来源，但默认选择性重写，不直接 fork。

### 6.4 Runtime

Runtime 是最小保障层。

Runtime 负责：

- session 生命周期。
- tool 执行宿主。
- token、步数、耗时和失败预算。
- stop / takeover / blocked。
- tool loop 检测。
- 状态广播和最终兜底。

Runtime 不负责：

- 按 workflow phase 写死业务语义。
- 替 LLM 做任务级语义决策。
- 替 tool 做浏览器局部恢复。

### 6.5 Memory

Memory 只保留结构化工作记忆：

- 用户偏好。
- 任务目标。
- 关键来源。
- 稳定事实。
- 可复用失败模式。
- 可复用页面/站点经验。

Memory 当前后置。没有可靠 tools 和裁剪层之前，memory 只会放大噪音。

## 7. 协议原则

字段级协议以代码为准，文档只记录不变量：

- runtime-visible tool result 必须可结构化消费。
- 内容脚本或 CDP 原子动作结果不等于最终 tool result。
- LLM 只能在授权工具和安全边界内行动。
- 工具内部错误应尽量恢复；无法恢复时返回可解释失败。
- 最终结果必须统一表达 `success / partial / failed / blocked`。
- 文档产物不是默认输出；只有用户明确要求文件、报告或 markdown 时才生成 artifact。

## 8. UI 契约

Side Panel 应表达：

- 当前目标。
- 当前正在使用的能力。
- 关键来源和关键失败。
- 可停止、可接管、可重试。
- 高风险动作需要确认。

UI 不应把旧 workflow phase 当作产品主流程。

`inline` 在会话流展示最终正文；`artifact` 展示短摘要和文档卡片；运行细节次于最终结果。

Updated: 2026-04-17
