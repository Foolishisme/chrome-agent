# Browser Agent 新线程索引

本文件服务于“线程重启后的新设计主线”。

核心定义：

`Agent = LLM + Tools + Memory + Runtime`

当前新主线强调：

- LLM 负责规划、调度、选择高阶 tool、生成最终结果
- Tools 封装规则、等待、重试、提取等脏活
- Memory 只保留高价值结构化上下文
- Runtime 负责循环、状态、校验、容错

## 新线程推荐入口

- [新规范：spec.md](/D:/code/browser-agent-mvp/doc/spec.md)
- [新线程启动词：thread_bootstrap.md](/D:/code/browser-agent-mvp/doc/thread_bootstrap.md)
- [当前代码现状：status.md](/D:/code/browser-agent-mvp/doc/status.md)
- [当前验收：acceptance.md](/D:/code/browser-agent-mvp/doc/acceptance.md)

## 历史文档

- [历史总入口：browser_agent_mvp_v1.md](/D:/code/browser-agent-mvp/doc/browser_agent_mvp_v1.md)
- [线程重启前快照目录](/D:/code/browser-agent-mvp/doc/history/2026-04-01-thread-reset/README.md)

## Source Of Truth

- 设计真相：`doc/spec.md`
- 新线程上下文入口：`doc/thread_bootstrap.md`
- 代码现状：`doc/status.md`
- 验收口径：`doc/acceptance.md`

## 更新规则

- 设计改变：更新 `doc/spec.md`
- 新线程启动上下文改变：更新 `doc/thread_bootstrap.md`
- 代码现状改变：更新 `doc/status.md`
- 验收状态改变：更新 `doc/acceptance.md`
- 设计发生范式切换时，先归档旧文档到 `doc/history/`

## 当前阶段约定

- 当前阶段不是在旧设计上继续打补丁
- 当前阶段是在高阶 tool 主线下重新收敛设计
- 任何新实现都应优先回答：
  - 这件事该由 `LLM` 做，还是该封进 `Tool`
  - 这段上下文是否值得给 LLM
  - 这一步是否必须进入 agent loop

Updated: 2026-04-01
