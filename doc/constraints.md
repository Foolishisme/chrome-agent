# Browser Agent 约束清单

## 1. 文档定位

本文档只记录当前主线下的硬约束、禁区和红线。

## 2. 架构红线

必须坚持：
- 产品目标是通用浏览器 Agent，不是 workflow 集合。
- `LLM` 是目标理解、工具选择、轮次决策和汇总的核心。
- `Runtime` 只做最小保障层。
- `Tools` 只暴露稳定语义能力。
- `BrowserCapabilityLayer` 封装浏览器控制、恢复、裁剪和 fallback。
- 新主链采用 bounded plan + thin runner；每轮 plan 默认 1-5 个 action。
- runtime-visible tool 必须通过 ToolRegistry 注册，并声明 schema、side effect、parallel policy、requires、produces 和 handler。
- 默认 driver 是 store-safe JS/DOM 路线，不默认依赖 `debugger` / CDP。
- `Memory` 后置，不作为当前优先差距。

明确禁止：
- 把 Runtime 膨胀成 workflow 引擎。
- 再按 `phase -> tool` 或 `stepId -> 业务语义` 编写主链。
- 把 bounded plan 扩展成无限 DAG 或重型编排框架依赖。
- 把当前任务模块当作长期产品边界。
- 把工具内部恢复拆成 raw DOM 动作交给 LLM。
- 为追求通用而直接暴露无限制 `evaluate`、任意 selector 或任意脚本执行。

## 3. 执行红线

- 新能力优先进入 `BrowserCapabilityLayer` 或稳定 tool。
- LLM 只能在明确授权的工具集合内行动。
- 每轮 plan 必须有 action 上限、工具白名单和失败策略。
- runner 可以依据 metadata 调度，但不能代替 LLM 补业务语义。
- tool result 必须短、结构化、带来源或失败解释。
- 页面内容进入 LLM 前必须裁剪、脱水或结构化。
- 搜索、读页、点击、输入等能力必须有预算、超时和失败路径。
- 默认做最小必要改动，不擅自重构、重命名或修改无关文件。
- 旧代码仅在阻塞编译、测试、安全、理解或新主链验证时才清理。

明确禁止：
- 让 LLM 绕过工具权限或安全边界。
- 让 tool 擅自改写产品目标。
- 让 runtime 替 LLM 做任务级语义决策。
- 让 LLM 输出未注册 action、任意 selector、任意 JS 或无限循环 plan。
- 为了“重开”而删除仍有对照或 fallback 价值的代码。
- 把未来方向或未验证设想顺手实现进当前任务。

## 4. Browser Capability 红线

允许推进：
- store-safe JS/DOM observe/read/extract
- `activeTab` / `scripting` / optional host access
- tab lifecycle
- content-script snapshot
- click / type / keyboard
- navigation wait / reload / fallback
- stale reference 恢复
- 受控 evaluate

必须满足：
- 用户能理解扩展正在控制浏览器页面。
- 用户能 stop、takeover 或关闭 session。
- 高风险动作前必须确认。
- 失败必须返回原因和建议下一步。
- 能用更低权限完成时，不扩大权限。
- `debugger` / CDP 只作为 advanced/local/enterprise driver。

明确禁止：
- 静默执行支付、下单、转账、删除、发送不可撤回内容等高风险动作。
- 在真实账号环境下绕过用户确认做长期自动化。
- 隐式读取无关高敏页面内容。
- 把 `cookies`、`identity`、`declarativeNetRequest` 作为第一阶段默认依赖。

## 5. 权限边界

- `debugger` / CDP 不是大众/商店默认主路径权限。
- 默认优先：`activeTab`、`scripting`、`storage`、必要且可解释的 host permissions。
- 按需评估：`tabs`、`offscreen`、optional host permissions。
- advanced/local/enterprise：`debugger`。
- 暂不作为第一阶段默认依赖：`identity`、`cookies`、`declarativeNetRequest`。
- `<all_urls>` 不作为商店默认权限；开发验证可短期使用，但必须与产品化 manifest 区分。

## 6. Tool 红线

- runtime-visible tool 必须返回统一高层 `ToolResult`。
- content script 或 CDP 原子动作只作为 tool 内部实现细节。
- 局部恢复、等待和 fallback 留在 tool 内。
- 页面读取必须返回覆盖边界、来源和失败项。
- 批量读取或并行执行必须有预算和取消机制。

明确禁止：
- 让高层 tool 返回 action-style 回执。
- 把长网页原文不裁剪直接喂给 LLM。
- 为每个页面细节新增一个 runtime-visible 原子 tool。
- 让 memory 存未裁剪网页噪音。

## 7. 输出红线

无论成功或失败，最终都必须返回结构化结果。

最终状态只允许：
- `success`
- `partial`
- `failed`
- `blocked`

明确禁止：
- 只返回原始日志。
- 只返回一句失败提示。
- 失败后没有 `errorsOrBlockers`。
- 失败后没有 `suggestedNextAction`。
- 成功后不说明关键来源或覆盖边界。

## 8. 人工确认项

以下事项默认不能自行拍板：
- 是否允许真实账号环境下的高风险自动化。
- 是否引入高成本付费依赖。
- 是否接受向后不兼容的对外协议变化。
- 是否切到完整动态 tool-loop runtime。
- 是否把 `cookies`、`identity`、`declarativeNetRequest` 纳入默认权限。

Updated: 2026-04-29
