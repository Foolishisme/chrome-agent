# Browser Agent 新线程启动词

## 1. 当前前提

项目当前定义仍是：

`Agent = LLM + Tools + Memory + Runtime`

但当前执行范式已经切换为：

`LLM plan-driven tool orchestration`

当前代码已跑通的模块是：

- `direct_answer`
- `commerce_search`
- `public_research`

当前已落地的新能力：

- `direct_answer`
  - 面向简单稳定知识问答、已搜索且证据充足后的追问，以及无需再开浏览器的直接回答
- `searchPreference = auto | prefer_search`
  - 只在边界不清时影响路由，不覆盖明确可直接回答的问题

## 2. 必须先记住的规则

- `LLM` 负责生成静态初始 plan、选择下一步 tool、更新 step 状态和最终汇总
- 是否需要搜索由 `LLM` 在规划阶段结合当前绝对时间、用户目标、近期证据和 `searchPreference` 判断
- `Tools` 负责提供可复用能力，并把脏活、局部恢复和 fallback 封装在内部
- `Memory` 只保留结构化 plan、tool result、artifacts 和事实
- `Runtime` 负责护栏、执行、持久化、停止与恢复，不再硬编码每个任务模块的固定 workflow
- 当前最小 runtime 护栏固定为：`20` 步硬上限、`15` 步软提醒、`3` 分钟超时、同 tool `3` 次失败停止、连续 `3` 步无进展停止
- 无论成功失败，最终都必须输出：`success | partial | failed | blocked`

## 3. 不要回到旧思路

不要把系统重新拉回以下方向：

- 为每个任务模块继续堆新的固定 phase workflow
- 让 `LLM` 直接决定 raw DOM 动作、selector 和等待细节
- 把 tool 内部步骤全部暴露成 runtime 直接调度的原子动作
- 一开始就支持执行中复杂 plan 改写
- 把大量页面噪音和原始日志塞进上下文

## 4. 新线程优先回答的问题

1. 当前任务目标是什么
2. 当前目标是否其实可以 `direct_answer`
3. 当前需要的静态初始 plan 是什么
4. 哪些能力值得成为 `runtime-visible tool`
5. 哪些步骤应留在 tool 内部
6. 当前是否已有对应的线程实例位于 `doc/threads/active/`
7. 当前 step 需要记什么结构化状态到 memory
8. 这次变更应更新哪一份文档

## 5. 可直接复制给 agent 的提示

```text
项目当前定义为：
Agent = LLM + Tools + Memory + Runtime

当前执行范式为：
LLM plan-driven tool orchestration

当前必须遵守：
- LLM 负责生成静态初始 plan、选择下一步 tool、更新 step 状态和最终汇总
- Tools 负责可复用能力，并把等待、fallback、下载、转换、提取等脏活封装在内部
- Runtime 只做护栏、执行、持久化、停止与恢复，不再为每个任务模块硬编码固定 workflow
- Runtime 最小护栏固定为：20 步硬上限、15 步软提醒、3 分钟超时、同 tool 3 次失败停止、连续 3 步无进展停止
- 到达 15 步时，LLM 必须开始收敛并准备给出 `partial / failed / blocked`
- 无论成功失败，最终都必须输出 `success | partial | failed | blocked`
- v1 先不做执行中复杂 plan 改写
- 默认不把 raw DOM 动作直接暴露给 LLM

请先判断：
1. 当前目标需要什么 plan
2. 这一步是 runtime-visible tool 还是 tool-internal step
3. 最小必要改动是什么
```

Updated: 2026-04-09
