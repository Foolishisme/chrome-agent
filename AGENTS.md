# Browser Agent Agent Guide

## 当前真相

产品目标：`大众用户可用的通用浏览器 Agent`

核心模型：`Agent = LLM + Tools + Memory + Runtime`

执行模型：`LLM-driven bounded plan + thin runner over Store-safe Browser Core V2`

默认事实源：

- [doc/spec.md](./doc/spec.md)
- [doc/constraints.md](./doc/constraints.md)
- [doc/checkpoint.md](./doc/checkpoint.md)
- 验收或验证范围相关任务再读 [doc/acceptance.md](./doc/acceptance.md)

## 工作规则

- 非简单修改前先读事实源文档。
- 默认做当前任务所需的最小改动。
- runtime-visible 能力优先进入稳定 tool 或 `BrowserCapabilityLayer`。
- raw DOM 动作、selector、等待、重试和局部恢复细节留在 tool 或浏览器能力层内部。
- `debugger` / CDP 是 advanced driver 路径，不是 store-safe 默认路径。
- 没有当前任务或事实源支持时，不实现面向未来的功能。
- 当事实源文档与代码表现不一致时，先检查 active call path 再改行为。
- 修改后运行与改动直接相关的最小验证，并报告结果。

## 文档规则

- 当前文档只描述当前架构和当前 checkpoint。
- 当前 checkpoint 写在 [doc/checkpoint.md](./doc/checkpoint.md)，更新时覆盖内容。
- 不把过程日记、review 转录、大型参考包或推测计划放进工作树。
- 本文件保持短小；详细设计在 `doc/spec.md`，红线在 `doc/constraints.md`，状态在 `doc/checkpoint.md`。

更新日期：2026-05-11
