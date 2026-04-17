# Design Log

## 2026-04-17 - 文档系统收缩

- Question: 当前文档系统是否继续沿 `threads / plan / ADR` 的任务级文件机制扩张。
- Options:
  - A: 保留 `threads/active`、任务级 `doc/plan/*.md` 和 ADR 作为常规沉淀机制。
  - B: 保留 `interaction / acceptance` 的职责分离，把线程、任务计划和普通决策过程收缩到按职责分开的 append-only logs。
- Decision: 采用 B。
- Reason: 当前主要摩擦不是缺少文档，而是默认装载过重、状态与过程混写、任务级文件数量膨胀。`interaction.md` 和 `acceptance.md` 仍有清晰职责，继续保留；`threads / doc/plan / ADR` 降级为历史或罕见例外。
- Revisit Trigger: 长期超过 4 条活跃任务线、多人成员共同维护、需要强审计链路，或设计决策反复被挑战且日志不足以说明背景。

## 2026-04-17 - 从旧线程迁入的设计结论

- Source: `doc/threads/active/design-doc-protocol-structure.md`
- Decision: 文档系统需要清晰分层，避免设计、路径、状态、线程和历史混写。
- Updated Decision: 原先推荐 `threads/active` 与 `adr/` 作为日常机制；本次收缩后，线程实例归档，设计取舍统一进入 `doc/logs/design.md`，ADR 只作为罕见例外。

- Source: `doc/threads/active/design-llm-first-plan-driven.md`
- Decision: 当前执行范式采用 `LLM plan-driven tool orchestration`，`LLM` 负责静态初始 plan、tool 选择、step 状态更新和最终汇总，`Tools` 封装稳定能力与局部恢复，`Runtime` 只做最小保障层。
- Current Status: 该结论已进入 `spec.md / constraints.md / status.md`，原线程只保留历史回溯价值。

- Source: `doc/threads/active/design-direct-answer-routing.md`
- Decision: `direct_answer` 成为正式 task module；是否搜索由规划阶段结合当前绝对时间、用户目标、近期证据和 `searchPreference` 判断。
- Current Status: 该结论已落地到代码和 `spec / constraints / acceptance`，原线程只保留历史回溯价值。

- Source: `doc/plan/2026-04-13-site-overview-mode.md`
- Decision: `site_overview` MVP 只覆盖可信入口、主页、一跳高价值页面、覆盖边界输出；不做深层递归、下载型附件或精准字段确认。
- Current Status: 该结论已落地到 `site_overview` 代码路径和验收补充，原任务级 plan 只保留历史回溯价值。

## 2026-04-17 - 新讨论稿处理

- Source: `doc/顶层设计草案.md`
- Decision: 提炼为文档系统与代码组织的顶层原则，不作为新的主入口文档。
- Extracted Principle: 让 AI 找得到、判得清、改得动、跑得通；让人类在关键处看得懂、接得住。

- Source: `doc/文件文档改版设计.md`
- Decision: 采纳“少量高权重文件 + 极小状态快照 + append-only logs”的方向，但保留 `interaction.md / acceptance.md` 的职责分离。

- Source: `doc/走过的弯路与收获_1_页.md`
- Decision: 作为复盘原文归档；核心经验进入 `pitfalls.md` 的按需查阅层。

## 2026-04-17 - 主文档脱水与按需层迁移

- Question: 主文档是否继续保留过去式、接口细节和按需材料在 `doc/` 根目录。
- Decision: 主文档只保留当前成立的规则、边界和不变量；过去式进入 logs/history；代码可查的接口细节不手抄；按需查阅层迁入 `doc/reference/`。
- Reason: 当前主要摩擦来自主文档内容过长、职责混写和默认入口噪音。`spec / acceptance / interaction` 需要继续保留，但必须脱水。
- Revisit Trigger: 如果项目进入多人协作、强审计或长期 active migration 阶段，再评估是否恢复 active `plan.md` 或更强决策记录机制。

## 2026-04-17 - 顶层设计原则落位

- Question: 顶层设计草案和原 AGENTS 中的设计思想是否应进入默认装载。
- Decision: 不新增默认必读长文档；将四个顶层设计目标写入 `spec.md`，将最小必要改动和未来事项不得顺手实现写入 `AGENTS.md / constraints.md`，完整原则放入 `doc/reference/design_principles.md` 按需查阅。
- Reason: 顶层原则应可执行，但不能重新加重默认装载层。
- Revisit Trigger: 如果多次出现架构取舍误判、过度抽象或未来能力被顺手实现，再评估是否把更多原则提升到默认入口。
## 2026-04-17 - ChromeClaw 深度调研决策记录

- Question: ChromeClaw 是否应成为当前浏览器通用 Agent 的主代码基底，或仅作为能力层与工程实现参考。
- Scope: 静态阅读 `D:\test\chromeclaw` 的文档、manifest、agent loop、tools、browser/CDP、offscreen、storage、UI 配置入口，并与当前 MVP 的 runtime、tool、snapshot、final result 合约对比；不运行真实扩展、不配置 provider、不做浏览器任务 spike。
- Decision: 暂定 `partially adopt`。当前 MVP 继续作为主代码基底，只选择性重写借鉴 ChromeClaw 的 CDP browser capability、tool registration、provider/options/offscreen 经验。
- Report: `doc/other/chromeclaw-deep-dive-decision.md`。
- Revisit Trigger: `site_overview explicit_url` 的 CdpDriver spike 在真实公共站点上显著优于当前 content-script driver，且 `debugger` 权限提示可被产品接受。
- Update: 用户明确指出 `debugger` 权限对大众用户不是主要阻力，通用浏览器 agent 本来就是目标；workflow 是因为尚未掌握通用流程而采用的验证脚手架。报告已修正为更积极采用 ChromeClaw browser capability，并把主要风险从权限接受度调整为安全 envelope、用户可见控制和无关高敏权限裁剪。
