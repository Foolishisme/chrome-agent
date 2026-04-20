# Browser Agent 当前状态

## Current Phase

`browser-core-v2-controlled-rebuild`

## Current Focus

当前主线已经从 workflow-first MVP 切换为通用浏览器 Agent 能力建设：

- 当前产品仓库：`D:\code\browser-agent-mvp`。
- ChromeClaw 参考仓库：`D:\test\chromeclaw`。
- 当前产品目标是大众用户可用的通用浏览器 Agent。
- 下一阶段核心任务已经确定为：在现有仓库内受控重建 `Browser Core V2`。
- 旧 workflow/module 保留为历史、对照、fallback 或 harness，不继续作为新主链投资。
- 关键能力是 `StoreSafeDriver + BrowserCapabilityLayer / BrowserDriver + Agent Loop V2 minimal + page trimming + tool-internal recovery`。
- 大众/商店默认路径不依赖 `debugger` / CDP；`CdpDriver` 后置为 advanced/local/enterprise driver。
- `explicit_url overview via StoreSafeDriver` 是默认第一闭环。
- Active migration plan: `doc/plan.md`。
- Browser Core V2 采用隔离参考重写岛：`src/browser-core-v2`，避免把新主线散落进旧 runtime/tools/workflow 主目录。

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
- Browser Core V2 受控重建计划已写入 active `doc/plan.md`。
- Phase 0 contract / mock driver / test harness 已有落地记录，现有 registry/runtime/workflow 未接入、未改变行为。
- Browser Core V2 文件框架已建立：`src/browser-core-v2/shared`、`content`、`background`、`test-support`。
- 已补充 `turndown`，用于 Readability HTML 到 markdown excerpt 的 store-safe 内容提取路径。
- 已新增 `doc/reference/browser_core_v2_file_framework.md`，记录新目录职责和产品/参考仓库路径。

## Blockers

- `StoreSafeDriver` 尚未接入真实 `chrome.tabs / chrome.scripting`。
- Agent Loop V2 minimal 尚未落地，现有 runtime 仍偏 plan-driven。
- 自动化真机扩展会话验证仍未稳定拿到项目扩展上下文。
- Provider live request 仍缺真实环境验证。
- stop / error / budget guardrails 仍缺真机可视化记录。

## Remaining Risks

- 过早删除旧 workflow 会损失对照和验证路径；当前应保留但不继续投资。
- 旧代码如果仍被主链 import/编译，可能拖累 Browser Core V2 独立验证。
- 只迁移 ChromeClaw 外形而不迁移 tool 内恢复、裁剪和单测，会得不到速度与稳定性收益。
- CDP/debugger 不适合作为大众/商店默认路径；若提前依赖会放大上架、隐私和用户信任风险。
- Source fact card 的 LLM 脱水效果仍需真实 provider 样本验证。
- `site_overview` 尚未完成 CDP 路径的 Chrome 真机样例验证。
- 精准型 research、下载型附件、PDF/Word/Excel 主链读取仍不在当前第一实验范围内。

## Next

1. 接线 `StoreSafeDriver` 到 `chrome.tabs / chrome.scripting`，让 `content-script-client` 能调用 `src/browser-core-v2/content` bridge。
2. 用 `explicit_url overview via StoreSafeDriver` 跑通不依赖旧 workflow 的第一闭环。
3. 对比旧 workflow path 与新 Browser Core V2 path 的稳定性、速度和结果质量。
4. 强化恢复、裁剪、stale target、page problem detection 和 result trimming。
5. 增加 click/type/scroll/press 的低风险动作子集和 action risk 分级。
6. 再实现 advanced `CdpDriver`，用于本地、企业或高级模式。

## Needs Human Decision

- manifest 中 `activeTab / scripting / optional host access` 的具体权限申请方式。
- Browser Core V2 何时注册为 runtime-visible tool。
- 低风险 click/type/press/scroll 的首批开放范围。
- `downloads` 权限与文件处理策略是否进入后续阶段。

## Latest Validation

- `npm test -- tests/browser-capability.test.ts tests/browser-core-v2/readable-content.test.ts tests/browser-core-v2/dom-snapshot.test.ts tests/browser-core-v2/browser-tool-schema.test.ts` 通过，4 个测试文件，12 个测试。
- `npm run build` 通过。
- `npx tsc --noEmit` 未通过；剩余错误位于既有 `llm-client`、`read-research-source-facts` 和旧测试 fixture 类型，不是 `src/browser-core-v2` 新增目录引入。
- 本次未加载真实扩展、未配置 provider、未跑真实网页任务。

Updated: 2026-04-20
