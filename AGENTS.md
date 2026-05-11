# Browser Agent Agent Guide

## 当前真相

产品目标：`大众用户可用的通用浏览器 Agent`

核心模型：`Agent = LLM + Tools + Memory + Runtime`

当前执行模型：`LLM-driven bounded tool loop + RuntimeBrowserDriver + content bridge`

默认事实源：

- [doc/spec.md](./doc/spec.md)
- [doc/constraints.md](./doc/constraints.md)
- [doc/checkpoint.md](./doc/checkpoint.md)
- 验收或验证范围相关任务再读 [doc/acceptance.md](./doc/acceptance.md)

## 工作规则

- 非简单修改前先读事实源文档。
- 默认做当前任务所需的最小改动。
- 优先复用当前已有实现；新增文件、helper、adapter、fallback、兼容层或抽象必须有当前存在性证明。
- 有效存在性证明：当前事实源需要、active call site 使用、当前测试保护、安全/数据风险保护、至少两个当前调用点消重。
- 无效理由：以后可能有用、为了扩展性、最佳实践、更灵活、防假想 bug。
- 修复腐坏实现时，优先在稳定契约后替换内部，不并排养两套架构。
- runtime-visible 能力优先进入稳定 tool 或当前 `RuntimeBrowserDriver` / content bridge 主链。
- raw DOM 动作、selector、等待、重试和局部恢复细节留在 tool、runtime driver 或 content action 内部。
- `debugger` / CDP 是 advanced driver 路径，不是当前默认路径。
- 没有当前任务或事实源支持时，不实现面向未来的功能。
- 当事实源文档与代码表现不一致时，先检查 active call path 再改行为。
- 修改后运行与改动直接相关的最小验证，并报告结果。

## 文档规则

- 核心文档采用覆盖式 current-state 记录，只描述当前目标、架构、约束、checkpoint 和验收。
- 修改文档前后自查：新增内容是否仍在描述当前有效事实；如果只是解释过去、迁移过程或方案对比，删除或转移。
- 当前 checkpoint 写在 [doc/checkpoint.md](./doc/checkpoint.md)，更新时覆盖内容。
- 过程日记、review 转录、大型参考包、推测计划和过去记录不进入当前事实源。
- 需要保留过去原因时，优先放在 Git commit message、PR/issue 或外部笔记。
- 本文件保持短小；详细设计在 `doc/spec.md`，红线在 `doc/constraints.md`，状态在 `doc/checkpoint.md`。

更新日期：2026-05-11
