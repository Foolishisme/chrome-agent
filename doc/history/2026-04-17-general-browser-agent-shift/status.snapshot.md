# Browser Agent 当前状态

## Current Phase

`implementation`

## Current Focus

当前主线是 `browser_research` 能力收口和真实环境验证：

- Runtime 已是 canonical plan loop。
- Tools 已按 `src/background/tools/` 拆分。
- `direct_answer / commerce_search / public_research / site_overview` 已进入当前主链。
- Research 来源输入已从长正文透传升级为 `SourceFactCard` 脱水证据。
- 文档系统已收缩为 `status + logs`，`interaction / acceptance` 作为按需职责文档保留。

## Done

- `Agent = LLM + Tools + Memory + Runtime` 已成为当前核心定义。
- `LLM plan-driven tool orchestration` 已替代旧 phase-driven loop。
- `PlanStep / ActionResult / ToolResult / FinalResult` 契约已收口。
- `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 已退出主链。
- `direct_answer` 已落地，支持简单稳定知识和已有证据后的追问直接回答。
- `searchPreference = auto | prefer_search` 已接入前后端链路。
- `commerce_search / public_research` 真机闭环已记录为 `user-reported`。
- `site_overview` 已落地为独立 task type，覆盖入口解析、主页和一跳高价值页面。
- `readResearchSourceFacts` 已新增 `SourceFactCard` 脱水证据，最终汇总不再直接接收长 `bodyExcerpt`。
- Side Panel 已统一为 turn 流展示，并按 `inline | artifact` 收口最终输出。
- 文档系统重构已完成结构迁移：默认装载层收缩为 `AGENTS + spec + constraints + status + single log`。

## Blockers

- 自动化真机扩展会话验证仍未稳定拿到项目扩展上下文。
- Provider live request 仍缺真实环境验证。
- stop / error / budget guardrails 仍缺真机可视化记录。

## Remaining Risks

- Source fact card 的 LLM 脱水效果仍需真实 provider 样本验证。
- 当前每个长来源串行脱水，真实延迟偏高时可能需要受限并发或缓存。
- `site_overview` 尚未完成 Chrome 真机样例验证。
- 精准型 research、下载型附件、PDF/Word/Excel 主链读取仍不在当前实现范围内。
- 旧文档链接若指向 `doc/threads/active/*` 或 `doc/plan/*`，需要改从 `doc/history/` 或 `doc/logs/` 回溯。
- 按需查阅层已迁移到 `doc/reference/`。

## Next

1. 记录 stop / error / budget guardrails 真机表现。
2. 做 Gemini / DeepSeek provider live request 联调确认。
3. 为 source fact card 补真实 provider 样本记录。
4. 为 `site_overview` 补 Chrome 真机样例验证。
5. 根据真实失败模式决定是否继续细拆 tool、扩展精准型 research 或补 PDF artifact。

## Needs Human Decision

- 暂无。

## Latest Validation

- `npm run build`
  - 通过，记录于 2026-04-16。
- `npm test -- tests/schema.test.ts tests/llm-client.test.ts tests/public-research.test.ts tests/site-overview.test.ts`
  - 4 个测试文件，38 个测试通过，记录于 2026-04-16。

Updated: 2026-04-17
