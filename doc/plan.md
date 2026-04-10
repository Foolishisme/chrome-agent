# Browser Agent 当前迁移路径

## 1. 文档定位

本文档只记录当前采用的迁移方案与执行路径，不再描述已经完成的过渡态目标。

## 2. 当前结论

`runtime/tool` 契约收口已完成，当前主线已经进入明确的 v1 形态：

- `用户目标 -> 生成静态 PlanStep[] -> runtime 执行`
- 单工具 step 直接执行
- 多工具 step 才调用 LLM 选 tool
- tool 内负责连贯子步骤和局部恢复
- runtime 只负责循环、护栏、记录、停止和统一输出

## 3. 本轮已完成

### 3.1 协议层

已完成：

- `ToolName` 收口为 8 个 canonical tool
- `ActionResult` 与高层 `ToolResult` 分离
- `FinalResult` 收口为单一最终输出协议
- `currentPhase / taskPlan / subtaskResults / finalSummary / finalOutput` 退出主链

### 3.2 Tool 层

已完成：

- `src/background/tools.ts` 拆为 `src/background/tools/`
- 拆出共享 helper / shared / registry
- 8 个 canonical tool 全部落地

### 3.3 Runtime 层

已完成：

- runtime 主循环改为 canonical plan loop
- 单工具直跑
- 多工具 step 才调用 `chooseNextTool`
- 移除按 `phase` / `stepId` 硬编码业务语义的推进逻辑
- 落地 `maxSameToolRetries = 3`
- 落地 `maxConsecutiveNoProgress = 3`
- stop / error 路径统一补 `FinalResult`

### 3.4 UI 与测试

已完成：

- Side Panel 改为读取 `finalResult`
- 不再展示 `currentPhase`
- 测试改为 canonical tool 命名和新结果协议

## 4. 当前后续路径

当前之后的优先级是：

1. 先补齐真机护栏验证
2. 再验证 `public_research` 第一页候选质量提升是否真实有效
3. 确认 `direct_answer / prefer_search` 的真机体验是否符合预期
4. 打通自动化真机扩展验证链路
5. 再做 provider live request 联调确认
6. 启动 `browser_research` 收口，先落 `site_overview MVP`
7. 最后才考虑是否继续细拆 tool、扩展精准型 research 或补 PDF artifact

## 5. 当前建议顺序

### 5.1 直接回答路由

已落地：

- 已新增 `direct_answer` task module，固定序列为 `compileTaskSpec -> finalizeDirectAnswer`
- 已在 `compileTaskSpec` 阶段由 `LLM` 判断当前目标应进入 `direct_answer / public_research / commerce_search`
- 路由判断已显式带上当前绝对时间、用户时区、最近几轮证据摘要，以及这些证据的获取时间
- 简单稳定知识、或当前 conversation 已有足够证据时，优先直接回答
- 问题依赖最新事实、现势状态，或用户显式要求“今天 / 当前 / 最新 / 本周 / 今年”等信息时，进入搜索链路
- 已新增 `searchPreference = auto | prefer_search`，仅在边界不清时影响路由，不覆盖明确可直接回答的问题

当前不建议：

- 把所有非购物问题默认打到 `public_research`
- 只传递“现在”这类相对时间，而不传绝对日期时间
- 只靠当前时间判断是否搜索，而不看已有证据是否足够
- 在证据不足且时效性不明时过度自信地直接回答

### 5.2 Side Panel 交互收口 v1

已落地：

- 初始态不展示空的“运行状态 / 结果”区
- 按会话状态切换主按钮：
  - 初始态只显示 `开始`
  - 运行中只显示 `停止`
  - 完成或失败后复用 `开始`
- 运行中时间线默认展开
- 最终结果出现后，时间线自动缩略为折叠态
- 已补输入框右上角 `智能回答 / 优先搜索` 开关

当前不建议：

- 现在就做真正的 token 级流式结果输出
- 为了“像聊天”而把 runtime 细节重新塞回结果区
- 先实现长对话 / 长记忆 UI

布局约束：

- 最终交付物始终优先于运行细节
- 如果后续引入长对话或 memory 区，默认放在最终输出之后

### 5.3 真机护栏验证

优先验证：

- `budgetLow`、连续失败、无进展在 UI 中的可见性
- `public_research` 停止 / 异常路径

说明：

- `commerce_search / public_research` 主链闭环当前已记录为 `user-reported`
- 当前缺的不是主链是否能跑，而是护栏在真实 UI 中是否可见、可理解

### 5.4 产物输出主链

已落地：

- `FinalResult.outputMode = inline | artifact`
- 默认只做 `inline` 结果输出
- 仅当用户明确要求“文档 / 报告 / markdown / 文件”时，生成 markdown artifact
- Side Panel 结果区已收口为“最终交付物”，运行细节回收到 runtime 区

当前不建议：

- 把“下载”设计成给 `LLM` 选择的 runtime-visible tool
- 把“是否产文档”放给 `finalize` 阶段临时猜测
- 为了导出能力先做完整文件系统抽象
- 让前端对整段对话、日志、timeline 做统一下载

### 5.5 第一页来源质量

优先落地：

- 保持 `public_research` 只读 Google 第一页候选
- 先做第一页候选过滤后的轻量重排序
- 对 query、标题、域名、snippet 做快速 LLM 重排
- 排序失败时严格回退到过滤后原顺序

当前不建议：

- 直接把有效来源目标从 3 提到 5
- 在没有证据前先翻第二页
- 让 LLM 自由增删候选链接

### 5.6 基于证据的细拆

只有在出现明确复用或失败模式时，才考虑继续细拆：

- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`

当前不为了结构整齐而继续拆分。

### 5.7 扩展新能力

在主链稳定前，不优先做：

- 长记忆泛化
- 完整的 `LLM` 可选工具通用化
- 真正的流式结果生成协议
- 执行中动态改 plan
- 原子 DOM 动作开放给 LLM
- 大而全的通用 adapter

### 5.8 browser_research 收口方向

当前设计结论：

- 顶层路由在 `compileTaskSpec` 一次性输出：
  - `direct_answer`
  - `commerce_search`
  - 当前或后续的 `browser_research mode`
- 不再拆成“先判断是否调研，再二次判断属于哪种调研”的两次独立大判断
- `browser_research` 当前先只开两个概况型 mode：
  - `site_overview`
  - `multi_source_overview`
- 当前 `public_research` 视为 `multi_source_overview` 的已实现代表分支，不急于先改名

当前建议顺序：

1. 先保持 `public_research` 作为多站概况型 research 主链
2. 下一步新增 `site_overview MVP`
3. 等概况型主链稳定后，再评估：
   - `site_precise`
   - `multi_source_precise`

`site_overview MVP` 的最低承诺：

- 输入为站点入口页或明确官网入口
- 第一阶段入口处理采用可复用的 `resolveEntryPoint`，不是固定搜索 step
- 读取主页与前 `N` 个高价值页面
- 输出粗粒度概况、来源链接和覆盖边界
- 明确说明“未覆盖整个站点”，不伪装成高置信精确结论

当前实现范围：

- 入口解析优先级：
  - 用户给 `URL` 时先直达并校验
  - `URL` 失效时只做一次有界修复
  - 未给 `URL` 时才解析官网主入口
- 一跳内站内页面发现：
  - 先读主页
  - 再从主页直达链接中挑选高价值页面
- 页面类型当前只覆盖可直接读取正文的 `html`
- 不做深层递归，不做整站 crawl
- 不默认跟进下载型附件或文档型资料

最小推进顺序：

1. 定义 `site_overview` 的最小 `TaskSpec`
2. 把第一步收口为可复用的 `resolveEntryPoint`
3. 定义 `site_overview` 的固定 `PlanStep` 模板
4. 给候选发现加上“主页 + 一跳高价值页面”的选择规则
5. 给最终输出补“覆盖边界 / 未覆盖区域 / 来源列表”
6. 补最小单测与真机样例

`site_overview MVP` 的最小停止条件：

- 读完主页并成功读取若干高价值页面后停止
- 达到 `pageReadLimit` 后强制停止
- 候选耗尽后停止
- 遇到登录墙、验证码或入口不可读时返回 `partial / blocked`

当前不建议：

- 一开始同时实现四类 mode
- 先做精准型 task，再倒推概况型骨架
- 一开始把第一步写死成“搜索前 5 个内容页”
- 一开始就支持深层站内递归
- 把“下载文件”单独抽成 runtime-visible tool
- 只把原始 URL 列表交给 LLM，不附带标题、区域和同域信号
- 默认把所有下载文档全文转成 txt 直接透传给 LLM

## 6. 当前明确不做

当前不做：

- 回退到旧 alias tool 和旧状态双轨
- 恢复 `currentPhase`
- 继续维护兼容层让新旧协议长期并存
- 把“下载文件”单独抽成 runtime-visible tool
- 为了形式整齐引入更多中间抽象

## 7. 2026-04-08 补充

### 7.1 research 页面正文输入

当前优先路径：

- `public_research` 来源页输入从“summary + keyPoints”收口为“title + bodyExcerpt”
- 页面提取层优先负责清洗正文、去噪和长度控制，不再强行替 LLM 做强摘要
- `Readability` 优先，结果不足时回退到现有 fallback
- `bodyExcerpt` 按段落拼接并限制上限，不做整页无限制透传

当前不建议：

- 在提取层继续堆更多规则式摘要模板来替 LLM 做总结
- 因为模型上下文足够大，就把整页原文无上限透传给最终汇总
- 混淆“代码擅长清洗 / LLM 擅长理解总结 / 人擅长评估验收”的边界

## 7.2 2026-04-08 Side Panel Follow-up

- 初始态不再显示空的“结果 / 运行状态”区
- 对话区主按钮收口为 `开始 / 停止`，不再暴露 `retry`
- 结果区采用半流式感知：最终结果出现前，先显示当前进展与执行时间线
- 最终结果出现后，执行时间线作为折叠的“执行 / 思考过程”保留在结果区
- 运行状态区继续承载摘要信息、日志和结构化细节，但在结果完成后默认折叠
- 仍不做真正的 token 级流式输出；当前只做符合现有 runtime 的半流式前端呈现
- 若后续引入 memory 长对话，布局顺序保持“最终输出在前，对话历史在后”

## 7.3 2026-04-08 Demo Session Archive

- demo 阶段不引入 thread memory 或数据库设施
- 本地持久化只做 session archive，不做长期知识库抽象
- 成功会话按“一轮一个对象”写入 `chrome.storage.local`
- 失败、异常、停止会话不落盘，等价于删除该轮全部步骤
- 前端只提供“删除当前这轮”的入口，不在本轮实现完整历史列表
- 若当前没有活跃会话，Side Panel 启动时可回填最近一次成功保存的会话

## 7.4 2026-04-08 Conversation Archive

- demo 阶段的连续对话不做 thread memory 系统，改做 `conversationId + turnId` 的本地会话归档
- 每个 turn 只沉淀 `用户提问 + 最终结果摘要 + 最终结果正文`
- 新 turn 开始时，仅把当前 conversation 里前几轮的 `提问 + 最终结果摘要` 作为背景注入规划与总结 prompt
- `turnId` 只做内部递增标识，不补位，也不在前端展示
- 前端对话区右上角承载会话管理：查看历史会话、切换会话、新建会话
- 回退语义固定为“回退到此轮并删除后续 turn”，不做任意单轮删除
- 删除语义固定为删除整条 conversation，不再保留其中任意 turn

Updated: 2026-04-10

## 7.5 2026-04-08 Conversation UI Follow-up

- 主对话区与历史会话区复用同一套 turn 流展示，不再在历史抽屉里单独维护第二套线程 UI
- 历史抽屉只负责会话列表、切换、新建和删除，点击历史会话本质上只是覆盖当前展示数据
- 输入框保持草稿态，不再被上一轮 `goal` 反向回填；首轮只显示“你想知道什么”占位，后续轮次默认留空
- 每个 turn 在归档时同时保存对应执行时间线，前端在会话流内按轮次显示
- 结果区只保留当前轮的复制/文档操作，不再重复渲染完整正文
- 历史 turn 的回答块应恢复独立复制入口
- 全局 `运行状态` 只服务当前正在执行的 session；历史轮次过程改由各自 turn 下的折叠时间线承载
- 进一步收口：`inline` 模式不再渲染独立结果区；运行中底部区域显示当前执行时间线，失败/阻塞/停止时才切回状态视图
