# Browser Agent 约束清单

## 1. 文档定位

本文档只记录当前主线下的硬约束、禁区和红线。

旧阶段快照已归档到 `doc/history/2026-04-17-general-browser-agent-shift/`。

## 2. 架构红线

必须坚持：

- 产品目标是通用浏览器 Agent，不是单个 workflow 集合。
- `LLM` 是目标理解、工具选择和汇总的决策核心。
- `Runtime` 只做最小保障层。
- `Tools` 只暴露稳定语义能力。
- `BrowserCapabilityLayer` 封装浏览器控制、恢复、裁剪和 fallback。
- 大众/商店默认 driver 是 store-safe JS/DOM 路线，不默认依赖 `debugger` / CDP。
- `Memory` 只保留结构化工作记忆，且当前后置。

明确禁止：

- 再把 `Runtime` 膨胀成隐式 workflow 引擎。
- 再按 `phase -> tool` 或 `stepId -> 业务语义` 写死主链。
- 把当前 workflow/module 当作长期产品边界。
- 继续围绕失败旧链路做主线投资，而不是推进 `Browser Core V2` 独立闭环。
- 把 tool 内局部恢复拆成 raw DOM 动作交给 LLM 编排。
- 为了追求通用而直接暴露无限制 `evaluate`、任意 selector 或任意页面脚本执行。

## 3. 执行红线

当前过渡期必须遵守：

- 代码仍可能使用 plan-driven loop，但新设计不得继续强化 workflow 依赖。
- 新能力优先进入 `BrowserCapabilityLayer` 或稳定 tool。
- LLM 只在明确授权的工具集合内行动。
- tool result 必须短、结构化、带来源或带失败解释。
- 页面内容进入 LLM 前必须裁剪、脱水或结构化。
- 搜索、读页、点击、输入等能力必须有预算、超时和失败路径。
- 默认只做最小必要改动，不擅自重构、重命名或修改无关文件。
- 旧代码可以保留为历史、对照、fallback 或 harness；只有阻塞编译、测试、安全、理解或新主链验证时才清理。

明确禁止：

- 对明显时效敏感的问题仅凭模型内置知识直接回答。
- 只把“现在 / 今天 / 最近”这类相对时间词交给 LLM，而不提供绝对日期时间。
- 让 LLM 绕过工具权限或安全边界。
- 让 tool 擅自改写产品级目标。
- 让 runtime 替 LLM 做任务级语义决策。
- 为了“重开”而删除仍有对照或 fallback 价值的旧代码。
- 为了追求 ChromeClaw 式能力而把 `debugger` / CDP 设为大众/商店默认路径。
- 把未来方向、未验证设想、下一阶段能力当作当前任务顺手实现；除非用户明确要求，否则只能记录为建议、风险或后续项。

## 4. Browser Capability 红线

允许推进：

- store-safe JS/DOM observe/read/extract。
- `activeTab` / `scripting` / optional host access。
- tab lifecycle。
- content-script snapshot。
- click / type / keyboard。
- navigation wait / reload / fallback。
- stale reference 恢复。
- 受控 evaluate。

必须满足：

- 用户能理解扩展正在控制浏览器页面。
- 用户能 stop、takeover 或关闭 session。
- 高风险动作前必须确认。
- 失败必须返回原因和建议下一步。
- 能用更低权限完成的能力，不默认扩大权限。
- `debugger` / CDP 只能作为 advanced/local/enterprise driver，不能作为大众/商店默认依赖。

明确禁止：

- 静默执行支付、下单、转账、删除、发送不可撤回内容等高风险动作。
- 在真实账号环境下绕过用户确认做长期自动化。
- 隐式读取无关高敏页面内容。
- 把 cookies、identity、declarativeNetRequest 等权限作为第一阶段默认依赖。

## 5. 权限边界

`debugger` / CDP 不作为大众/商店默认主路径权限。

原因：

- `debugger` 权限无法作为普通 optional permission 延后申请。
- 它会触发高风险权限解释和用户信任问题。
- 浏览器页面内容交给 LLM 处理时，还会放大隐私、数据处理和跨境传输风险。

若在 advanced/local/enterprise driver 中使用，必须配套：

- 权限说明。
- 运行中状态提示。
- stop / takeover。
- 高风险确认。
- 最小权限裁剪。

权限分级：

- 默认优先：`activeTab`、`scripting`、`storage`、必要且可解释的 host permissions。
- 按需评估：`tabs`、`offscreen`、optional host permissions。
- advanced/local/enterprise：`debugger`。
- 暂不作为第一阶段默认依赖：`identity`、`cookies`、`declarativeNetRequest`。

`<all_urls>` 不作为大众/商店默认权限；开发验证可短期使用，但必须与产品化 manifest 区分。

## 6. Tool 红线

必须满足：

- runtime-visible tool 返回统一高层 `ToolResult`。
- 内容脚本或 CDP 原子动作只作为 tool 内部实现细节。
- 局部恢复、等待和 fallback 留在 tool 内。
- 页面读取必须返回覆盖边界、来源和失败项。
- 批量读取或并行执行必须有预算与取消机制。

明确禁止：

- 让高层 tool 返回旧的 action-style 回执。
- 把长网页原文无裁剪塞给 LLM。
- 为每个页面细节新增一个 runtime-visible 原子 tool。
- 让 memory 存储未裁剪网页噪音。

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
- 是否从过渡期 plan-driven runtime 切换为完整动态 tool-loop runtime。
- 是否把 cookies、identity、declarativeNetRequest 纳入默认权限。

Updated: 2026-04-20
