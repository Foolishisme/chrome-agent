# Browser Agent Guide

文档默认采用中文撰写。本文件只记录本仓库特有规则；通用编码协作规则按用户全局 rules 执行。

## 当前事实

- 产品目标：大众用户可用的通用浏览器 Agent。
- 核心模型：`Agent = LLM + Tools + Memory + Runtime`。
- 当前主链：`LLM-driven bounded tool loop + RuntimeBrowserDriver + content bridge`。
- 默认事实源读取顺序：`doc/checkpoint.md` → `doc/constraints.md` → `doc/spec.md`；涉及验收范围时再读 `doc/acceptance.md`。

## 本地目录约定

- `tmp/`：短生命周期中间文件和一次性调试输入输出；目录保留，内容默认不进入 Git。
- `output/`：浏览器、Playwright、真实运行 smoke 等可复现或可审查的运行输出；默认不进入 Git。

## 架构约束

- 面向 runtime / LLM 可见的能力，优先进入稳定 tool 或当前 `RuntimeBrowserDriver` / content bridge 主链。
- raw DOM 动作、selector、等待、重试和局部恢复细节留在 tool、runtime driver 或 content action 内部。
- 新增文件、helper、adapter、fallback、兼容层或抽象必须有当前存在性证明：当前主链 active call site 使用、当前测试保护、安全/数据风险保护，或至少两个当前调用点消重。
- 仅有“以后可能有用”“为了扩展性”“更灵活”“防假想 bug”或规划性文字，不算存在性证明。
- fallback 只能服务当前已存在的失败路径，不为假想失败模式预埋。
- 修复腐坏实现时，在稳定契约后替换内部，不并排养两套架构。
- `debugger` / CDP 是 advanced driver 路径，不是当前默认路径；除非事实源和 active call site 明确要求，不主动切换。

## 检查规则

- 常规小改动优先运行 `npm run check:fast`。
- 架构收敛、命名收敛、死代码清理或大范围改动后运行 `npm run check:repo`。
- 重要合并前运行 `npm run check`。
- 预计或实际改动达到 500 行或 8 个文件以上时，运行 `npm run check:repo`；可用 `npm run check:change-size` 判断阈值。
- `npm run check:unused` 可作为删除依据；`npm run check:unused:exports` 只提供候选，删除前必须确认 active call path。
- 验证失败时，不隐藏、不绕过；先判断是否由本次改动引起，并在修改后说明中写清失败命令、失败原因和剩余风险。

## 文档规则

- 核心文档采用覆盖式 current-state 记录，只描述当前目标、架构、约束、checkpoint 和验收。
- 只有任务要求更新状态、阶段变化或事实源过期时，才覆盖 `doc/checkpoint.md`。
- 过程日记、review 转录、大型参考包、推测计划和过去记录不进入当前事实源。
- 本文件保持短小；详细设计在 `doc/spec.md`，红线在 `doc/constraints.md`，状态在 `doc/checkpoint.md`。
