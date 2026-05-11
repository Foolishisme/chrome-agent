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
- 预计或实际改动达到 500 行或 8 个文件以上时，默认运行 `npm run check:repo`；重要合并前运行 `npm run check`。
- 静态检查报告只作为删除候选证据；不能仅凭 Knip/grep 输出批量删除文件、导出或依赖，必须先确认 active call path 和当前存在性证明。

## 命名与可检索性规则

- 文件夹、文件、函数和导出名要服务于 agent/human 的精准检索；`git grep <核心概念>` 的前几条结果应尽量指向真实 owner 或当前主链入口。
- 命名必须表达当前事实，不用 `legacy`、`v2`、`future`、`deprecated`、`facade`、`core` 等词保留历史计划或制造平行架构感，除非事实源和 active call site 明确需要。
- 如果能力仍在当前主链使用，不要用 `legacy` 命名；改成描述当前职责的名字。
- 如果能力不在当前主链使用，不靠重命名伪装为当前能力；按存在性证明判断删除、迁移或保留。
- 宽泛命名如 `helper`、`manager`、`handler`、`core`、`utils` 应尽量带上所属边界和职责，避免 grep 结果无法区分 owner。
- 重命名后必须同步 imports、tests 和事实源文档，并用静态 grep 验证旧噪音名是否消失或只剩明确的历史兼容测试。
- 结构审查优先使用 `git grep` 和 tracked source；必须做文件系统递归扫描时，排除 `output/`、`dist/`、`node_modules/`、`doc/.obsidian/` 等生成、缓存或本地工具目录。

## 静态检查规则

- 常规小改动优先运行 `npm run check:fast`，覆盖 typecheck、lint 和测试。
- 架构收敛、命名收敛、死代码清理或大范围改动后运行 `npm run check:repo`，覆盖 Knip、dependency-cruiser、repo hygiene、legacy refs 和 current-state docs 检查。
- `npm run check:unused` 是高置信度 gate，只检查未使用文件、依赖、未声明依赖和无法解析引用；unused exports 使用 `npm run check:unused:exports` 单独出报告后人工判断。
- `npm run check:change-size` 用于判断当前 diff 是否触发大范围改动阈值；触发后按本节规则补跑仓库级检查。

## 文档规则

- 核心文档采用覆盖式 current-state 记录，只描述当前目标、架构、约束、checkpoint 和验收。
- 修改文档前后自查：新增内容是否仍在描述当前有效事实；如果只是解释过去、迁移过程或方案对比，删除或转移。
- 当前 checkpoint 写在 [doc/checkpoint.md](./doc/checkpoint.md)，更新时覆盖内容。
- 过程日记、review 转录、大型参考包、推测计划和过去记录不进入当前事实源。
- 需要保留过去原因时，优先放在 Git commit message、PR/issue 或外部笔记。
- 本文件保持短小；详细设计在 `doc/spec.md`，红线在 `doc/constraints.md`，状态在 `doc/checkpoint.md`。

更新日期：2026-05-11
