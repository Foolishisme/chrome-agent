# Browser Agent 约束清单

## 1. 定位

本文记录当前主路径的硬约束和禁区。

## 2. 架构约束

必须成立：

- 产品目标是通用浏览器 Agent。
- `LLM` 负责目标理解、tool choice、round decision 和 synthesis。
- `Runtime` 是最小保障层。
- `Tools` 暴露稳定语义能力。
- `BrowserCapabilityLayer` 封装浏览器控制、恢复、裁剪和 fallback。
- 主路径采用 bounded plan + thin runner；每轮默认 1-5 个 action。
- runtime-visible tools 必须通过 ToolRegistry 注册，并声明 schema、side effect、parallel policy、requires、produces 和 handler metadata。
- 默认 driver 路径是 store-safe JS/DOM。
- `Memory` 优先级低于 tool、恢复、裁剪和 runner 稳定性。

禁止：

- 把 Runtime 扩成 workflow engine。
- 用任务族 phase script 编写主链行为。
- 把 bounded plan 扩成 unbounded DAG orchestration。
- 把当前 task modules 当成产品架构边界。
- 把 tool 内部恢复步骤暴露给 LLM。
- 为通用场景暴露 unrestricted `evaluate`、任意 selector 或任意 script。

## 3. 执行约束

必须成立：

- 新能力先进入 `BrowserCapabilityLayer` 或稳定 tool。
- LLM 只能在授权 tool set 内行动。
- 每轮都有 action limit、tool allowlist 和 failure policy。
- Runner 可以按 metadata 调度，但不能添加业务语义。
- Tool result 必须短、结构化、带来源或失败解释。
- 页面内容进入 LLM 前必须裁剪、脱水或结构化。
- Search、read、click 和 type 能力必须有预算、超时和失败路径。
- 修改保持最小且聚焦当前任务。
- Compatibility helpers 需要当前 call site、当前 spec 需要、当前测试或安全需要。

禁止：

- 绕过 tool 权限或安全边界。
- 让 tools 改写产品目标。
- 让 runtime 做任务级语义决策。
- 让 LLM 输出未注册 action、任意 selector、任意 JS 或 unbounded plans。
- 在没有事实源支持时实现面向未来的想法。

## 4. Browser Capability 约束

允许方向：

- store-safe JS/DOM observe/read/extract；
- `activeTab` / `scripting` / optional host access；
- tab lifecycle；
- content-script snapshot；
- click / type / keyboard；
- navigation wait / reload / fallback；
- stale reference recovery；
- controlled evaluate subset。

必须成立：

- 用户能理解扩展正在控制页面。
- 用户能 stop、takeover 或关闭 session。
- 高风险 action 需要确认。
- 失败返回原因和建议下一步。
- 权限范围尽量窄。
- `debugger` / CDP 属于 advanced/local/enterprise driver scope。

禁止：

- 静默支付、下单、转账、删除或发送不可撤回内容。
- 在真实账号场景中无确认地执行长程自动化。
- 读取无关高敏页面内容。
- 默认依赖 `cookies`、`identity` 或 `declarativeNetRequest`。

## 5. 权限边界

- 默认：`activeTab`、`scripting`、`storage` 和可解释的 host permissions。
- 按场景评估：`tabs`、`offscreen`、optional host permissions。
- advanced/local/enterprise：`debugger`。
- 默认延后：`identity`、`cookies`、`declarativeNetRequest`。
- 商店分发路径必须避免宽泛 host permissions，除非有明确理由。

## 6. Tool 约束

- runtime-visible tools 返回高层 `ToolResult`。
- content script 和 CDP atoms 留在 tool 实现细节内部。
- 局部恢复、等待和 fallback 留在 tools 内。
- 页面读取返回覆盖边界、来源和失败。
- 批量读取或并行执行必须有预算和取消机制。

禁止：

- 高层 tools 返回 action-style receipts。
- 把长篇 raw page text 直接喂给 LLM。
- 为页面细节新增 runtime-visible atomic tools。
- 把未裁剪页面噪音写进 memory。

## 7. 输出约束

终态 status 只能是：

- `success`
- `partial`
- `failed`
- `blocked`

每个终态结果包含：

- 用户可读 summary；
- 关键来源或覆盖边界；
- 存在时包含 errors or blockers；
- blocked 或 failed 时包含 suggested next action。

## 8. 人工确认

以下事项需要人工决策：

- 高风险真实账号自动化；
- 高成本付费依赖；
- 对外不兼容协议变化；
- 完整 dynamic tool-loop runtime 切换；
- 默认使用 `cookies`、`identity` 或 `declarativeNetRequest`。

更新日期：2026-05-11
