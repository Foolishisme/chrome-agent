# Plan Record: plan-mode-doc-record skill

## 基本信息

- 日期: 2026-04-07
- 任务: 新增一个全局 Codex skill，在 Plan 模式下优先在项目 `doc/plan/` 下创建任务级记录文件
- 记录范围: 本次只新增全局 skill，并在当前仓库建立对应的计划记录目录与示例记录

## 变更原因

- 现有项目通常只有 `doc/plan.md` 这类项目级规划文档，缺少“单次任务级”的 Plan 模式落盘记录
- Plan 模式中的讨论如果只停留在对话里，后续接手、回溯和审计成本高
- 需要一个全局 skill，让 Codex 在不同项目中都优先执行同一套记录动作，而不是只在当前仓库临时约定

## 变更点

- 在 `C:\\Users\\LXT\\.codex\\skills\\plan-mode-doc-record\\` 新增全局 skill
- skill 约定默认使用 `doc/plan/YYYY-MM-DD-short-topic.md` 作为任务级记录文件
- skill 约定在缺少 `doc/` 或 `doc/plan/` 时先创建目录
- skill 约定记录内容至少覆盖任务摘要、变更原因、范围、计划改动、验证和风险
- 在当前仓库新建 `doc/plan/` 目录，并补一份本次变更记录，作为落地示例

## 非目标

- 不修改当前项目已有的 `doc/plan.md` 主规划文档职责
- 不改写当前项目其它 `doc/` 规范文件
- 不触碰工作区中与本任务无关的未提交代码改动

## 实际落地

- 新增 `C:\\Users\\LXT\\.codex\\skills\\plan-mode-doc-record\\SKILL.md`
- 新增 `C:\\Users\\LXT\\.codex\\skills\\plan-mode-doc-record\\agents\\openai.yaml`
- 新建当前仓库 `doc/plan/` 目录
- 新增本文件，记录这次 skill 变更的原因、范围和验证情况

## 验证计划

- 校验 skill 目录结构是否符合 Codex skill 规范
- 校验 `SKILL.md` frontmatter 是否完整
- 校验 `agents/openai.yaml` 是否生成且默认提示词正确
- 运行 skill 校验脚本，确认新增 skill 可通过最小验证

## 风险与待确认

- 该 skill 是全局能力，是否在未来所有会话中稳定触发，还取决于描述与触发条件是否足够贴合实际请求
- 不同仓库可能已有 `doc/plans/` 或其它命名方式，skill 当前采用“优先沿用本地约定，否则默认 `doc/plan/`”的策略
- 当前只做了结构和规则级验证，未在真实 Plan 模式线程里做一次完整前向演练
