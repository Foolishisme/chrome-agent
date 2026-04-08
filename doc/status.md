# Browser Agent 状态检查点

## 1. Current Phase

`implementation`

## 2. Current Focus

当前主线已经从“过渡层迁移”切到“canonical v1 收口完成后的稳定化”，当前重点先转为 Side Panel 交互收口，再继续做结果质量验证：

- Runtime 已是 canonical plan loop
- Tools 已按 `src/background/tools/` 拆分
- 状态模型、tool 契约、最终输出契约已统一
- Side Panel 已改为读取 `finalResult`
- `commerce_search / public_research` 真机闭环已通过，当前记录为 `user-reported`
- 结果输出已收口为 `inline | artifact`
- `public_research` 已在第一页过滤后增加轻量 research 候选重排序
- 下一步优先做初始态隐藏、按钮收口和时间线折叠

## 3. Done

### 3.1 协议

- `src/shared/types.ts`
  - canonical `ToolName` 已收口
  - `ActionResult` / 高层 `ToolResult` 已分离
  - `FinalResult` 已统一并增加 `outputMode`
  - `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 已退出主链

- `src/shared/schema.ts`
  - `nextToolSelectionSchema` 只允许 canonical tool
  - `finalResultSynthesisSchema` 已对齐新 `FinalResult`
  - `actionResultSchema` 已替代旧 action-level `ToolResult`
  - research 候选重排序 schema 已新增

### 3.2 Runtime / Tools

- `src/background/runtime-core.ts`
  - runtime 已改为静态 plan 驱动循环
  - 单工具 step 不调用 LLM
  - 多工具 step 才调用 `chooseNextTool`
  - 已落地重复失败和无进展护栏

- `src/background/tools/`
  - 已拆为共享 helper、registry 和 7 个 canonical tool 文件

- `src/background/tools.ts`
  - 已退化为 barrel export
- `src/background/tools/collect-research-candidates.ts`
  - 已在第一页 research 候选过滤后增加轻量重排序
- `src/background/llm-client.ts`
  - 已新增 research 候选重排序调用与严格回退

### 3.3 UI

- `src/sidepanel/index.ts`
  - 结果区已按 `inline | artifact` 分流
  - 运行细节已回收到 runtime 区
  - 文档产物仅在显式文档请求下展示复制 / 下载
  - 不再依赖 `currentPhase`

- `src/sidepanel/i18n.ts`
  - runtime 状态已收口为 `idle | running | done | error`

### 3.4 文档

- `doc/adr/0002-converge-runtime-tool-contracts.md` 已新增
- `spec / constraints / plan / status / acceptance` 已对齐当前代码事实

## 4. Validation

最新验证检查点：

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
  - 当前未能稳定拿到项目扩展上下文，记录为 blocker

时间：`2026-04-07`

## 5. Remaining Risks

当前主要剩余风险：

- Side Panel 初始态仍展示空的运行区与结果区，首屏噪音偏高
- `retry` 仍在初始态暴露，按钮语义不够收敛
- 结果仍为一次性最终显示，运行中缺少更自然的过程感呈现
- stop / error / budget guardrails 仍缺真机可视化验证记录
- provider live request 仍缺真实环境验证
- 目前仍不支持执行中动态改 plan
- research 第一页候选重排序已落地，但尚缺“重排前后成功来源命中率”记录
- 自动化真机扩展会话验证仍被浏览器扩展附着条件阻塞

## 6. Rejected Paths

本轮明确放弃：

- 继续保留旧 alias tool
- 继续让 runtime 维护 `phase` 兼容逻辑
- 为了形式整齐继续堆中间抽象
- 在没有真实证据前继续细拆 tool

## 7. Next Actions

1. 落地 Side Panel 初始态隐藏空的运行区与结果区
2. 将主按钮改为状态驱动的 `开始 / 停止 / 再次运行`
3. 将时间线改为运行中展开、完成后自动折叠
4. 记录 stop / error / budget guardrails 真机表现
5. 记录 research 第一页重排前后的成功来源命中率
6. 打通自动化真机扩展验证链路
7. 根据新增真实失败模式决定是否继续细拆 tool 或扩展 PDF artifact

## 8. 2026-04-08 补充

### 8.1 research 页面输入现状

- `src/content/research.ts`
  - research 来源页提取已改为 `Readability 优先 + fallback`
  - 页面输入不再以 `summary + keyPoints` 为主
  - 当前主输入已收口为 `pageTitle + bodyExcerpt + textLength + extractionStrategy`
- `src/background/tools/read-research-source-facts.ts`
  - research source 记录已改为保存 `bodyExcerpt`
- `src/background/prompting.ts`
  - 最终汇总 prompt 已明确将 `bodyExcerpt` 视为主证据正文
- `src/sidepanel/index.ts`
  - 运行详情与本地提取样本区已改为展示正文片段，而不是摘要/要点

### 8.2 本轮最小验证

- `npx.cmd vitest run tests/public-research.test.ts tests/research-search-quality.test.ts tests/sidepanel.test.ts tests/schema.test.ts`
  - 4 个测试文件，22 个测试通过
- `npm.cmd run build`
  - 通过

### 8.3 当前新增风险

- research 页面正文虽然已切到 `bodyExcerpt`，但“前部截断是否总是最佳证据段”仍需人工样本继续验证
- Side Panel 若后续引入半流式感知，需要避免把最终结果协议重新拉回流式耦合

### 8.4 Side Panel v1 收口现状

- `src/sidepanel/index.ts`
  - 初始态已隐藏空的运行区与结果区
  - 按钮已收口为 `开始 / 停止`
  - 结果区在最终结果出现前先展示当前进展与执行时间线，作为半流式过程感知
  - 最终结果出现后，执行时间线改为折叠显示，运行状态区默认收起
- `tests/sidepanel.test.ts`
  - 已补初始态隐藏、运行中过程展示、完成后折叠、结果复制/文档下载验证

### 8.5 本轮最小验证

- `npx.cmd vitest run tests/sidepanel.test.ts`
  - 1 个测试文件，4 个测试通过
- `npm.cmd run build`
  - 通过

### 8.6 当前剩余边界

- 当前“半流式”只是在前端重用 runtime 过程数据，不是 provider 级流式输出
- 如果后续引入 memory 长对话，还需要单独设计输出区之后的对话历史承载方式

### 8.7 Demo Session Archive 现状

- `src/background/session-archive.ts`
  - 已新增本地 session archive 存储
  - 当前采用 `chrome.storage.local`，按“一轮会话一个对象”保存
  - 当前只保存 `finalResult.status = success` 的成功会话
- `src/background/runtime-core.ts`
  - 成功完成后会自动写入本地 archive
  - stop / error / blocked / failed 不会保留本地会话记录
- `src/background/index.ts`
  - `REQUEST_SESSION_STATE` 在无活跃状态时会回填最近一次成功保存的会话
  - 已支持删除指定 `sessionId` 的本地会话归档
- `src/sidepanel/index.ts`
  - 结果区已新增“删除本轮”入口
  - 删除后会清空当前展示，回到初始态

### 8.8 本轮最小验证

- `npx.cmd vitest run tests/sidepanel.test.ts tests/session-archive.test.ts`
  - 2 个测试文件，6 个测试通过
- `npm.cmd run build`
  - 通过

### 8.9 当前剩余边界

- 当前只回填最近一条成功归档，不提供历史会话列表或多条切换
- 当前删除的是整轮会话对象，不支持只删部分步骤
- 当前本地 archive 是 demo 设施，后续如接入登录/云端存储，应抽象统一的 memory store 接口

### 8.10 Conversation Archive 现状

- `src/background/session-archive.ts`
  - 已从单条成功 session 归档升级为 `conversation + turns`
  - 每个 turn 保存 `goal / final summary / final markdown / final state`
  - 已支持新建、切换、删除 conversation，以及回退到指定 turn
- `src/background/runtime-core.ts`
  - 启动新 turn 时可带入当前 conversation 的历史摘要背景
  - 成功完成后会把当前 turn 追加到所选 conversation
- `src/background/tools/compile-task-spec.ts`
  - query refinement 已可读取最近几轮的 `提问 + 最终结果摘要` 作为背景
- `src/background/tools/finalize-commerce-result.ts`
  - 最终结果汇总已可读取最近几轮背景
- `src/background/tools/finalize-research-result.ts`
  - 最终结果汇总已可读取最近几轮背景
- `src/sidepanel/index.ts`
  - 对话区已新增会话入口与历史会话抽屉
  - 当前会话内可查看 turn 流，并支持“回退到此轮”

### 8.11 本轮最小验证

- `npx.cmd vitest run tests/sidepanel.test.ts tests/session-archive.test.ts`
  - 2 个测试文件，6 个测试通过
- `npm.cmd run build`
  - 通过

### 8.12 当前剩余边界

- 当前连续对话只注入前几轮的 `提问 + 最终结果摘要`，不注入中间步骤、日志和网页正文
- 当前历史会话列表仍是本地 demo 设施，没有登录、多端同步或数据库抽象
- 当前回退后 `turnId` 继续递增、不补位，但前端不显示内部 turn 编号

Updated: 2026-04-08

### 8.13 2026-04-08 Conversation UI 收口

- `src/sidepanel/index.ts`
  - 会话主视图已改为统一 turn 流展示，历史抽屉只保留会话列表与管理动作
  - 当前轮输入框固定在会话流底部，不再被上一轮问题自动回填
  - 会话管理按钮与回退/删除操作已固定为中文文案
  - 结果区已收口为当前轮操作区，不再重复渲染完整正文
  - 历史 turn 已恢复单独复制入口
  - `inline` 成功结果不再占用独立结果区；底部只在运行中显示时间线，在失败/阻塞/停止时显示状态
  - 历史过程通过各自 turn 下的时间线查看
- `src/background/session-archive.ts`
  - 归档 turn 已补充 `timeline`
  - 旧 turn 若不存在 `timeline`，回填为空数组，避免前端读取旧本地数据时报错
- `src/background/runtime-core.ts`
  - 成功 turn 归档时会携带本轮执行时间线

### 8.14 本轮最小验证

- `npx.cmd vitest run tests/sidepanel.test.ts tests/session-archive.test.ts`
  - 2 个测试文件，8 个测试通过
- `npm.cmd run build`
  - 通过

### 8.15 2026-04-08 Direct Answer 设计拍板

- `doc/spec.md / constraints.md / plan.md / acceptance.md / thread_bootstrap.md`
  - 已将 `direct_answer` 收口为正式 task module
  - 已拍板是否需要搜索由 `LLM` 在规划阶段判断
  - 已拍板路由判断输入需显式包含当前绝对时间、用户时区、近期证据摘要与证据获取时间
  - 已拍板简单稳定知识、或当前 conversation 已有充分证据时应优先直接回答
- 当前代码仍未落地：
  - `src/shared/types.ts` 仍只定义 `commerce_search / public_research`
  - `src/background/query-compiler.ts` 仍默认把非购物问题路由到 `public_research`
  - 当前路由链路尚未显式注入当前时间与证据时间
