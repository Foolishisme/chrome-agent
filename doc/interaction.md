# Browser Agent 交互规则

## 1. 定位

本文记录当前产品表达和交互规则。

## 2. 原则

- 最终结果优先于执行细节。
- 过程可见，但处于次级位置。
- 输入框代表当前本地 draft。
- 保存的 conversations 不修改 active draft。
- 前端只展示状态，不替代 runtime 或 LLM 做路由。

## 3. 结果展示

- 最终回答正文只出现一次。
- `inline` result 显示在所属 turn。
- `artifact` result 显示为短摘要和 artifact card。
- 结果 actions 限定在当前 turn。
- 保存的 turns 使用与 active turns 相同的展示结构。

## 4. 过程展示

- 运行中的 sessions 可以展示 timeline 和当前进度。
- 执行细节弱于最终内容。
- 完成后的过程详情应折叠或放在回答下方。
- 用户 stop 不显示为系统错误。
- tool 内部 retry 默认不展开成错误详情。

## 5. 输入与状态

- 输入框维护本地 draft state。
- 选择保存的 conversation 不覆盖输入框。
- Session updates 不覆盖输入框。
- 运行期间按 `Enter` 不触发隐藏停止行为。
- 搜索偏好是启动提示，不是强制任务路由。
- 明确直答 prompt 不强制进入 browser search。

## 6. 保存的 Conversations

- 保存的 conversations 使用低干扰 drawer 或等价入口。
- Turn timeline 归属于对应 turn。
- Copy、delete 和 switch actions 绑定明确 turn 或 conversation。
- Running-session switch、rollback 或 deletion 需要防止状态错觉。

## 7. 失败与阻塞状态

- 明确 failure、blocked 或 error 时，runtime state 可以展开。
- `partial / blocked / failed` 状态必须说明剩余边界。
- 结果必须说明未完成区域或不确定性。
- Limited-read 结果不能表达为完整覆盖。

## 8. 当前非目标

- Token-level streaming protocol。
- 把 runtime debug panel 作为主阅读路径。
- 在前端硬编码 task routing。
- 保存的 conversation state 进入 active input flow。

更新日期：2026-05-11
