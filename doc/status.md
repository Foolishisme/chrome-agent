# Browser Agent 状态检查点

## 1. Current Phase

`implementation`

## 2. Current Focus

当前主线已经从“canonical v1 收口”进入“路由质量与真机验证”阶段，当前重点是把已落地能力和真实使用表现对齐：

- Runtime 已是 canonical plan loop
- Tools 已按 `src/background/tools/` 拆分
- 状态模型、tool 契约、最终输出契约已统一
- `direct_answer / commerce_search / public_research` 三类路由已打通
- `searchPreference = auto | prefer_search` 已接入前后端链路
- Side Panel 已改为读取 `finalResult`，并使用统一 turn 流承载当前与历史会话
- `commerce_search / public_research` 真机闭环已通过，当前记录为 `user-reported`
- 结果输出已收口为 `inline | artifact`
- `public_research` 已在第一页过滤后增加轻量 research 候选重排序
- 下一步优先做真机护栏验证、provider 联调和路由体验验证
- 下一阶段的大方向已收口为：保留 `direct_answer / commerce_search`，并把广义网页调研收口为 `browser_research` 家族
- `browser_research` 当前先只计划两个概况型 mode：`site_overview / multi_source_overview`
- 下一步准备把 `site_overview MVP` 落成最小可执行主链：主页 + 一跳高价值页面 + 覆盖边界输出

## 3. Done

### 3.1 协议

- `src/shared/types.ts`
  - canonical `ToolName` 已收口
  - `TaskType` 已扩为 `direct_answer / commerce_search / public_research`
  - `searchPreference = auto | prefer_search` 已进入主链状态
  - `ActionResult` / 高层 `ToolResult` 已分离
  - `FinalResult` 已统一并增加 `outputMode`
  - `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 已退出主链

- `src/shared/schema.ts`
  - `nextToolSelectionSchema` 只允许 canonical tool
  - task route schema 已允许 `direct_answer / commerce_search / public_research`
  - `finalResultSynthesisSchema` 已对齐新 `FinalResult`
  - `actionResultSchema` 已替代旧 action-level `ToolResult`
  - research 候选重排序 schema 已新增

### 3.2 Runtime / Tools

- `src/background/runtime-core.ts`
  - runtime 已改为静态 plan 驱动循环
  - 单工具 step 不调用 LLM
  - 多工具 step 才调用 `chooseNextTool`
  - 已落地重复失败和无进展护栏
  - 路由判断已显式注入当前绝对时间、用户时区、近期对话摘要与 `searchPreference`

- `src/background/tools/`
  - 已拆为共享 helper、registry 和 8 个 canonical tool 文件
  - 已新增 `finalize-direct-answer.ts`

- `src/background/tools.ts`
  - 已退化为 barrel export
- `src/background/tools/collect-research-candidates.ts`
  - 已在第一页 research 候选过滤后增加轻量重排序
- `src/background/llm-client.ts`
  - 已新增 research 候选重排序调用与严格回退
  - 已新增 direct-answer 路由与最终回答调用

### 3.3 UI

- `src/sidepanel/index.ts`
  - 会话区已统一为 turn 流展示
  - 结果区已按 `inline | artifact` 分流，且不再重复渲染 inline 成功正文
  - 运行细节已回收到 runtime 区
  - 文档产物仅在显式文档请求下展示复制 / 下载
  - 输入框右上角已新增 `智能回答 / 优先搜索` 开关
  - 不再依赖 `currentPhase`

- `src/sidepanel/i18n.ts`
  - runtime 状态已收口为 `idle | running | done | error`
  - 已新增 `direct_answer` 与搜索偏好相关文案

### 3.4 文档

- `doc/adr/0002-converge-runtime-tool-contracts.md` 已新增
- `spec / constraints / plan / status / acceptance` 已对齐当前代码事实

## 4. Validation

最新验证检查点：

- `npm.cmd test`
  - 12 个测试文件，84 个测试通过
- `npm.cmd run build`
  - 通过
- `npx.cmd vitest run tests/query-compiler.test.ts tests/runtime-tools.test.ts tests/schema.test.ts`
  - `direct_answer / prefer_search / schema` 相关专项验证通过
- `npx.cmd vitest run tests/research-search-quality.test.ts`
  - research 搜索候选重排与信息提取专项测试通过
- Chrome 真机手测
  - `public_research` 闭环通过，`user-reported`
  - `commerce_search` 闭环通过，`user-reported`
- 自动化真机附着验证
  - 已尝试附着现有浏览器与新拉起 Chrome
  - 当前未能稳定拿到项目扩展上下文，记录为 blocker

时间：`2026-04-09`

## 5. Remaining Risks

当前主要剩余风险：

- stop / error / budget guardrails 仍缺真机可视化验证记录
- provider live request 仍缺真实环境验证
- 目前仍不支持执行中动态改 plan
- research 第一页候选重排序已落地，但尚缺“重排前后成功来源命中率”记录
- 自动化真机扩展会话验证仍被浏览器扩展附着条件阻塞
- `direct_answer / prefer_search` 已落地，但仍缺真机连续追问样本与误判样本记录
- `browser_research` 当前仍只有 `public_research` 这一个已实现代表分支，`site_overview` 尚未落地
- 精准型 research 尚未进入主线，当前不应高估“官网字段确认 / 文档名单抽取”的完成度

## 6. Rejected Paths

本轮明确放弃：

- 继续保留旧 alias tool
- 继续让 runtime 维护 `phase` 兼容逻辑
- 为了形式整齐继续堆中间抽象
- 在没有真实证据前继续细拆 tool

## 7. Next Actions

1. 记录 stop / error / budget guardrails 真机表现
2. 记录 `direct_answer / prefer_search` 的真机连续追问样本与误判样本
3. 记录 research 第一页重排前后的成功来源命中率
4. 做 Gemini / DeepSeek provider live request 联调确认
5. 打通自动化真机扩展验证链路
6. 起草并落地 `site_overview MVP` 的最小 task spec / plan template / stop condition
7. 根据新增真实失败模式决定是否继续细拆 tool、扩展精准型 research 或补 PDF artifact

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

### 8.15 2026-04-08 Direct Answer 设计拍板（历史记录，已被 8.16 覆盖）

- `doc/spec.md / constraints.md / plan.md / acceptance.md / thread_bootstrap.md`
  - 已将 `direct_answer` 收口为正式 task module
  - 已拍板是否需要搜索由 `LLM` 在规划阶段判断
  - 已拍板路由判断输入需显式包含当前绝对时间、用户时区、近期证据摘要与证据获取时间
  - 已拍板简单稳定知识、或当前 conversation 已有充分证据时应优先直接回答
- 该小节记录拍板当时状态；实现已在 8.16 落地

### 8.16 2026-04-08 Direct Answer 已落地

- `src/shared/types.ts / src/shared/schema.ts / src/shared/constants.ts`
  - `TaskType` 已扩为 `direct_answer / commerce_search / public_research`
  - canonical tool 已补 `finalizeDirectAnswer`
  - 默认计划已补 direct-answer 双步骤主链
- `src/background/query-compiler.ts`
  - 已新增 `direct_answer` 路由与 `DirectAnswerTaskSpec`
  - 规则回退已支持“简单稳定知识直接答”“会话内追问直接答”“明显时效敏感问题走搜索”
- `src/background/runtime-core.ts`
  - 启动路由时已显式传入当前绝对时间、用户时区和最近几轮会话摘要
  - `direct_answer` 启动时不再强制跳转到 Google 或京东
- `src/background/prompting.ts / src/background/llm-client.ts`
  - task route prompt 已收口为 `direct_answer / commerce_search / public_research`
  - 已新增 direct-answer 专用最终回答 prompt
- `src/background/tools/`
  - 已新增 `finalize-direct-answer.ts`
  - `compile-task-spec.ts` 已支持 direct-answer task spec 编译
  - `open-search-results.ts` 已显式拒绝 direct-answer task，避免误入搜索链路

### 8.17 本轮最小验证

- `npm.cmd run build`
  - 通过
- `npx.cmd vitest run tests/query-compiler.test.ts tests/runtime-tools.test.ts tests/schema.test.ts`
  - 3 个测试文件，26 个测试通过
- `npx.cmd vitest run tests/public-research.test.ts`
  - 1 个测试文件，9 个测试通过
- `npm.cmd test`
  - 12 个测试文件，84 个测试通过

### 8.18 2026-04-08 搜索偏好开关

- `src/sidepanel/index.ts / public/sidepanel.css / src/sidepanel/i18n.ts`
  - 输入框右上角已新增放大镜开关，用于切换 `智能回答 / 优先搜索`
  - 开关状态作为下一轮启动参数传入后台，不由前端直接决定 task module
- `src/shared/protocol.ts / src/shared/types.ts`
  - 已新增 `searchPreference = auto | prefer_search`
- `src/background/runtime-core.ts / src/background/query-compiler.ts / src/background/prompting.ts`
  - 路由判断已显式接收搜索偏好
  - 当用户选择 `prefer_search` 时，边界不清的问题会更偏向进入 `public_research`
  - 但明确可直接回答的问题仍保持 `direct_answer`

### 8.19 本轮最小验证

- `npx.cmd vitest run tests/query-compiler.test.ts tests/sidepanel.test.ts`
  - 2 个测试文件，20 个测试通过
- `npm.cmd run build`
  - 通过

### 8.20 2026-04-09 通用调研方向拍板

- 顶层产品方向继续保持：
  - `direct_answer`
  - `commerce_search`
  - `browser_research`
- `browser_research` 当前先不做“四类齐上”，而是只先做两类概况型 mode：
  - `site_overview`
  - `multi_source_overview`
- 当前 `public_research` 视为 `multi_source_overview` 的已实现代表，不急于先改名
- “是否需要调研”和“属于哪种调研”在 `compileTaskSpec` 一次性完成，不拆成两次大判断
- 站内多级跳转、附件跟进、文档下载与解析仍优先留在 tool 内部，不抽成独立下载 tool

### 8.21 2026-04-09 `site_overview MVP` 最小范围

- 当前 `site_overview MVP` 只承诺：
  - 读取主页
  - 读取主页直达的一跳高价值页面
  - 输出粗粒度概况、来源列表和覆盖边界
- 当前不承诺：
  - 深层站内递归
  - 下载型资料进入主链
  - 精准字段确认
- 最小停止条件已拍板为：
  - 主页 + 若干高价值页面读完即停
  - 达到 `pageReadLimit` 即停
  - 候选耗尽即停
  - 登录墙 / 验证码 / 入口不可读时返回 `partial / blocked`

Updated: 2026-04-09
