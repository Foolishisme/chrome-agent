# Browser Agent 设计规范

## 1. 定位

本文记录当前有效的设计真相、组件边界和不变量。

代码级协议优先查看：

- `src/shared/types.ts`
- `src/shared/schema.ts`
- `src/shared/protocol.ts`
- `src/shared/browser-capability.ts`
- `src/background/runtime/runtime-core.ts`
- `src/background/runner/`
- `src/background/tools/`
- `src/background/browser/overview/explicit-url-overview.ts`
- `src/background/browser/capability/types.ts`
- `src/content/bridge.ts`
- `src/content/index.ts`
- `src/content/scanner.ts`
- `src/content/actions.ts`
- `src/content/research.ts`
- `src/content/extractor.ts`

## 2. 产品目标

产品目标：
`大众用户可用的通用浏览器 Agent`

核心模型：
`Agent = LLM + Tools + Memory + Runtime`

当前执行模型：
`LLM-driven bounded tool loop + RuntimeBrowserDriver + content bridge`

## 3. 当前主链

默认 session 路径：

`START_SESSION -> BrowserAgentRuntime -> runBrowserCoreV2Loop -> task executor -> first-party tools -> RuntimeBrowserDriver -> content bridge`

浏览器页面能力通过两类消息进入 content script：

- `REQUEST_SNAPSHOT`：调用 `scanPage()` 生成页面快照。
- `EXECUTE_ACTION`：调用 `executeAction()` 执行当前已有 action。

当前内容提取与交互实现位于 `src/content/scanner.ts`、`src/content/actions.ts`、`src/content/research.ts` 和 `src/content/extractor.ts`。

## 4. 组件边界

### LLM

LLM 负责：

- 理解用户目标。
- 生成或修正任务语义。
- 在授权 tool set 内做选择。
- 判断当前证据是否足以 finalize、replan 或 abort。
- 汇总最终结果并说明覆盖边界。

LLM 不负责 raw DOM 动作、selector、等待、滚动、坐标、重试细节或权限绕过。

### Tools

runtime-visible tools 只保留当前四个：

- `browser.search`
- `browser.webDetail`
- `browser.siteOverview`
- `skill.commerceResearch`

Tools 负责稳定语义能力、调用当前 `BrowserDriver`、裁剪结果、返回结构化输出和失败说明。Tools 不维护全局 workflow 脑子，不新增页面级 atomic tool 表面。

### Runtime 和 Runner

Runtime 负责 session 生命周期、stop、最小状态广播、conversation archive、run log 和终态兜底。

Runner 当前按任务族执行 bounded round：

`taskSpec -> bounded round execution -> decideRoundAction -> finalize | replan | abort`

这里的 plan 是当前轮局部计划，不是持久 workflow engine，也不是无限 DAG。

### BrowserDriver 和 Content Bridge

当前默认浏览器驱动是 `RuntimeBrowserDriver`。它封装 Chrome tab 操作、页面稳定等待、content message 发送、风险阻断和失败问题结构化。

`content-bridge.js` 是当前 fallback 注入桥，暴露 `scanCurrentPage` 和 `executeCurrentAction` 给 runtime 使用。

### Memory

Memory 保存结构化工作状态、候选、来源、失败、工具级 run log 和 conversation archive 所需终态信息。页面噪音进入 LLM 前必须被裁剪或结构化。思考链或中间推理过程不进入前端状态、conversation archive 或 run log。

## 5. 不变量

- runtime-visible tool result 必须可结构化消费。
- LLM 只能在授权 tools 和安全边界内行动。
- raw DOM、selector、等待、重试和局部恢复细节留在 content action、tool 或 runtime driver 内部。
- 每轮 bounded execution 必须受 action、step、time 和 failure policy 约束。
- 终态结果始终是 `success / partial / failed / blocked`。
- 未接入当前主链的 driver、facade、bridge、helper、adapter 或测试不进入当前事实源。

## 6. UI 契约

Side Panel 只负责启动/停止会话、维护会话历史、展示最小运行占位、简短失败提示、最终回答和 artifact 操作。前端不展示 runtime debug panel、执行 timeline、调试日志、当前 step/tool 或 thinking 过程。路由和执行决策留给 runtime、runner 和 LLM 边界。

更新日期：2026-05-11
