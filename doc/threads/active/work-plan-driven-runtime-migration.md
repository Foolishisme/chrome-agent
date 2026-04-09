# Work Thread

## 1. 基本信息

- Thread: `work-plan-driven-runtime-migration`
- Status: `DOING`
- Owner: `Codex + user`
- Related taskModule: `direct_answer / commerce_search / public_research / browser_research`
- Updated: `2026-04-09`

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

当前新增拍板：
- Side Panel 下一步优先做交互收口 v1，而不是先上真正流式结果或长对话 UI
- 当前先做：
  - 初始态隐藏空的运行区与结果区
  - 主按钮按状态收口为 `开始 / 停止 / 再次运行`
  - 时间线运行中展开、结果完成后自动折叠
- 当前不先做：
  - token 级流式结果输出
  - 长记忆 / 长对话 UI

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

- Side Panel 交互收口 v1
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
- 当前不优先做真正的流式结果生成协议
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
## 7. 2026-04-08 补充记录

### 7.1 本轮补充结论

- 连续对话前端已收口为一套统一会话流，不再让“历史会话”和“当前会话”各维护一套线程视图
- 历史抽屉当前只负责：
  - 查看会话列表
  - 切换会话
  - 新建会话
  - 删除当前会话
- 输入框当前按本地 draft 处理，不再被历史 `goal` 或 session state 自动回填
- 每个 turn 现在都会保留自己的执行时间线，历史过程跟着 turn 走，不再依赖全局 runtime 面板

### 7.2 UI 收口结果

- `src/sidepanel/index.ts`
  - 主对话区已经变成唯一的问答正文显示区
  - `inline` 成功结果不再单独占用“结果”区，避免最新回答重复显示
  - 历史 turn 和 live turn 都支持复制结果
  - 当前运行中，底部展示的是执行时间线
  - 失败 / 阻塞 / 停止时，底部展示的是运行状态和原因
  - 运行中禁用了会话切换 / 新建 / 删除 / 回退，避免用户误判“切换后状态丢失”
- `src/background/runtime-core.ts`
  - 当前 turn 成功结束后，归档时会携带本轮 timeline
- `src/background/session-archive.ts`
  - conversation turn 已补 `timeline`
  - 旧本地 turn 缺少 `timeline` 时回填为空数组

### 7.3 本轮验证

- `npx.cmd vitest run tests/sidepanel.test.ts tests/session-archive.test.ts`
  - 2 个测试文件，8 个测试通过
- `npm.cmd run build`
  - 通过

### 7.4 当前剩余边界

- 会话相关中文文案目前仍有一部分在 sidepanel 内局部覆盖，尚未彻底统一回 `i18n`
- 当前运行中不支持旁观其他会话，只做“禁切换”这条更稳的 demo 语义
- `artifact` 模式仍保留独立结果区；若后续要把文档预览并回会话流，需要单独定规则

## 8. 2026-04-09 通用调研方向补充记录

### 8.1 设计结论

- 顶层继续保持三类方向：
  - `direct_answer`
  - `commerce_search`
  - `browser_research`
- `direct_answer` 继续作为单独的轻路由分支，不并入浏览器主链
- `commerce_search` 暂时仍保留为独立垂直任务模块，不立即并入 `browser_research`
- `browser_research` 当前先不做“四类齐上”，只先做：
  - `site_overview`
  - `multi_source_overview`
- 当前 `public_research` 视为 `multi_source_overview` 的已实现代表，不急于先改名

### 8.2 执行约束

- “是否需要调研”和“进入哪种调研 mode”在 `compileTaskSpec` 一次性判断
- 不拆成“先判要不要调研，再判 site / multi-source”的两次大判断
- 站内多级跳转、附件跟进、文档下载与解析继续封在 tool 内部
- 当前不新增独立 `download` runtime-visible tool

### 8.3 下一步建议

- 先保持现有 `public_research` 主链作为多站概况型 research
- 下一阶段新增 `site_overview MVP`
- `site_precise / multi_source_precise` 后置，等概况型主链稳定后再评估

### 8.4 `site_overview MVP` 范围

- 最小目标：
  - 读取站点主页
  - 读取主页直达的一跳高价值页面
  - 输出粗粒度概况、来源列表和覆盖边界
- 当前不做：
  - 深层递归
  - 下载型资料主链
  - 精准字段确认
- 最小停止条件：
  - 达到 `pageReadLimit`
  - 高价值候选耗尽
  - 入口被登录墙 / 验证码 / 非网页资源阻断
