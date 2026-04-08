# Work Thread

## 1. 基本信息

- Thread: `work-plan-driven-runtime-migration`
- Status: `DOING`
- Owner: `Codex + user`
- Related taskModule: `commerce_search / public_research`
- Updated: `2026-04-07`

## 2. 本轮结论

本线程原目标是把主链从过渡态收口到明确的 v1：
- 一套 canonical tool
- 一套高层 `ToolResult`
- 一套 `FinalResult`
- `currentPhase` 退出主链
- runtime 改为 canonical plan loop

上述主目标已完成。

在此基础上，本轮又继续补齐了当前 v1 主链的两类收口：
- 最终交付收口为 `inline | artifact`，且文档仅在显式请求时生成
- `public_research` 第一页候选在过滤后增加轻量重排序

## 3. 已完成事项

- 新增 ADR：
  - `doc/adr/0002-converge-runtime-tool-contracts.md`
- 协议收口：
  - `src/shared/types.ts`
  - `src/shared/schema.ts`
  - `FinalResult.outputMode = inline | artifact`
- tools 拆分：
  - `src/background/tools/`
  - `src/background/tools.ts` 已退化为 barrel export
- runtime 收口：
  - `src/background/runtime-core.ts`
  - `src/background/runtime.ts`
- side panel 同步：
  - `src/sidepanel/index.ts`
  - `src/sidepanel/i18n.ts`
  - 结果区只展示最终交付物
  - 文档卡片改为标题 + 右上角复制/下载 + 正文
  - 已新增“提取当前页 / 清空样本”按钮与本地提取样本区
- research 第一页质量增强：
  - `src/background/tools/collect-research-candidates.ts`
  - `src/background/llm-client.ts`
  - 已落地第一页候选过滤后的轻量重排序与严格回退
- 页面提取人工评测工具：
  - `src/background/manual-extraction.ts`
  - 复用 `EXTRACT_PAGE_FACTS`，并将样本保存到 `chrome.storage.local`
- 正文提取升级：
  - `src/content/research.ts`
  - 已接入 `Readability`，采用 `Readability 优先 + 现有 fallback`
  - 本地样本区会显示最终采用的提取策略
  - 研究页输入结构已从“summary + keyPoints”改为“title + bodyExcerpt”
- 最终回答格式收口：
  - `src/background/prompting.ts`
  - 已改为“简短总结 + 表格优先 + 信息源结尾”的弱结构约束
- 自动化测试已更新到 canonical 契约
- `spec / plan / status / acceptance / pitfalls` 已同步

## 4. 验证

- `npm.cmd test`
  - 11 个测试文件，71 个测试通过
- `npm.cmd run build`
  - 通过
- `npx.cmd vitest run tests/research-search-quality.test.ts`
  - research 搜索候选重排与信息提取专项测试通过
- Chrome 真机手测
  - `public_research` 闭环通过，`user-reported`
  - `commerce_search` 闭环通过，`user-reported`
- 自动化真机附着验证
  - 已尝试附着现有浏览器与新拉起 Chrome
  - 当前未能稳定拿到项目扩展上下文，仍是 blocker

## 5. 剩余事项

- stop / error / budget guardrails 真机可视化记录
- provider live validation
- research 第一页重排前后命中率记录
- 自动化真机扩展附着链路打通
- 基于真实失败模式评估是否继续细拆 tool 或扩 `PDF artifact`

补充说明：
- `commerce_search` 真机闭环当前已补记录为 `user-reported`
- `public_research` 真机闭环当前已补记录为 `user-reported`
- 当前不优先做长记忆泛化
- 当前不优先做完整 `LLM` 可选工具通用化
- “下载”不作为独立 runtime-visible tool，而作为已有结果产物的前端导出能力
- 不默认生成文档；只有用户明确要求“文档 / 报告 / markdown / 文件”时才走 artifact 交付

## 6. 接手建议

接手时先看：

- `src/background/runtime-core.ts`
- `src/background/tools/registry.ts`
- `src/background/tools/collect-research-candidates.ts`
- `src/background/llm-client.ts`
- `src/background/prompting.ts`
- `src/shared/types.ts`
- `doc/spec.md`
- `doc/status.md`
- `doc/acceptance.md`

当前不要做：

- 恢复旧 alias tool
- 恢复 `currentPhase`
- 在没有真实证据前继续细拆 tool
- 引入执行中动态改 plan
- 先做长记忆泛化
- 先做完整 `LLM` 可选工具通用化
