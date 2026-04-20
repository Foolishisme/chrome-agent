# Browser Agent 当前状态

## Current Phase

`paradigm-transition`

## Current Focus

当前主线已经从 workflow-first MVP 切换为通用浏览器 Agent 能力建设：

- 当前产品目标是大众用户可用的通用浏览器 Agent。
- workflow/module 保留为验证场、训练轮和可沉淀 skill/tool 的脚手架。
- 下一阶段核心任务已经确定为：参考 ChromeClaw 分阶段迁移/重写 browser tools。
- 关键能力是 `BrowserCapabilityLayer + CdpDriver + page trimming + tool-internal recovery`。
- `site_overview explicit_url` 是默认第一迁移实验。
- Active migration plan: `doc/plan.md`。

## Done

- `Agent = LLM + Tools + Memory + Runtime` 已成为核心定义。
- `LLM plan-driven tool orchestration` 已替代更早的 phase-driven loop，并作为当前代码过渡基线存在。
- `PlanStep / ActionResult / ToolResult / FinalResult` 契约已收口。
- `direct_answer / commerce_search / public_research / site_overview` 已进入当前代码主链。
- Research 来源输入已从长正文透传升级为 `SourceFactCard` 脱水证据。
- Side Panel 已统一为 turn 流展示，并按 `inline | artifact` 收口最终输出。
- ChromeClaw 静态调研已完成，结论记录在 `doc/other/chromeclaw-deep-dive-decision.md`。
- 产品流程记录已新增到 `doc/other/browser-agent-product-flow.md`。
- 旧阶段核心文档快照已归档到 `doc/history/2026-04-17-general-browser-agent-shift/`。
- 浏览器工具迁移已拆为 Phase 0-5，并恢复 active `doc/plan.md` 作为下一阶段核心任务计划。

## Blockers

- `BrowserCapabilityLayer` / `CdpDriver` 尚未落地。
- 现有 runtime 仍偏 plan-driven，尚未完成 general browser tool-loop 切换。
- 自动化真机扩展会话验证仍未稳定拿到项目扩展上下文。
- Provider live request 仍缺真实环境验证。
- stop / error / budget guardrails 仍缺真机可视化记录。

## Remaining Risks

- 过早删除 workflow 会损失现有可验证路径；当前应保留为 harness。
- 只迁移 ChromeClaw 外形而不迁移 tool 内恢复、裁剪和 batch，会得不到速度与稳定性收益。
- CDP/debugger 能力会扩大权限解释成本，必须配套用户可见控制。
- Source fact card 的 LLM 脱水效果仍需真实 provider 样本验证。
- `site_overview` 尚未完成 CDP 路径的 Chrome 真机样例验证。
- 精准型 research、下载型附件、PDF/Word/Excel 主链读取仍不在当前第一实验范围内。

## Next

1. Phase 0: 串行冻结 `BrowserCapabilityLayer` 接口、driver contract、核心类型和 mock driver。
2. Phase 1: 并发实现只读 `CdpDriver`、页面裁剪、`site_overview explicit_url` adapter 和测试夹具。
3. 串行集成 `site_overview explicit_url`，对比 CDP driver 与当前 content-script driver。
4. Phase 2: 补 tab lifecycle、navigate/reload/wait、attach/reattach 和 navigation fallback。
5. Phase 3: 增加 click/type/scroll/press 的低风险动作子集和 action risk 分级。
6. Phase 4: 把批量读取、受限并发、tool 内恢复和 result trimming 做厚。
7. Phase 5: tools 稳定后再开放低风险 general browser mode，并评估 runtime tool-loop 迁移。

## Needs Human Decision

- 是否接受第一阶段申请 `debugger` 与必要 host permissions 用于 CDP spike。
- 是否把 `<all_urls>` 作为开发验证阶段默认权限，产品化前再裁剪。
- 是否把旧 workflow 文档继续只保留在 history/reference，不再作为当前默认入口。
- 是否批准 Phase 0/1 按 `doc/plan.md` 的串行接口定界 + 并发能力块方式启动。

## Latest Validation

- 本次为迁移计划文档同步，未运行构建、测试或真实浏览器任务。
- 上次代码验证记录：
  - `npm run build` 通过，记录于 2026-04-16。
  - `npm test -- tests/schema.test.ts tests/llm-client.test.ts tests/public-research.test.ts tests/site-overview.test.ts` 通过，4 个测试文件，38 个测试，记录于 2026-04-16。

Updated: 2026-04-17
