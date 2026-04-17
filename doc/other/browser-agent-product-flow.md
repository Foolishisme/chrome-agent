# Browser Agent 产品流程与推进路径

Updated: 2026-04-17

## 1. 定位

目标产品是面向大众用户的通用浏览器 Agent。

它不是只做固定 workflow 的研究工具，也不是单纯的 CDP/Playwright 替代品。固定 workflow 在当前阶段的作用是把能力边界、观察方式、动作可靠性、失败恢复和用户可见状态先跑清楚。最终方向是让用户可以直接提出浏览器任务，由 Agent 观察网页、导航、执行低风险动作，并在高风险动作前请求确认。

核心判断：

- `debugger` 权限可以接受，但必须有清楚的用户解释、运行状态提示、停止入口和高风险动作确认。
- workflow 是通用浏览器 Agent 的训练轮和验证场，不是长期产品边界。
- 当前 MVP 的 `PlanStep`、`allowedTools`、`ToolResult`、`ActionResult`、`SemanticSnapshot`、`FinalResult` 仍然有价值，应先作为安全骨架保留。
- ChromeClaw 的 CDP/browser capability 应积极吸收，但不要直接继承全部产品范围和非核心集成。

## 2. 用户侧产品流程

用户使用流程应该逐步收敛为：

1. 用户打开 Side Panel。
2. 用户输入自然语言目标，例如：
   - “帮我看一下当前页面讲了什么。”
   - “打开这个网站，概览它主要提供什么。”
   - “帮我找官网里的价格/文档/联系我们。”
   - “帮我在页面里找到某个入口并点进去。”
3. Agent 判断任务类型和风险等级。
4. Agent 展示当前准备做什么：
   - 要访问哪些页面。
   - 要读取哪些内容。
   - 是否会执行点击、输入、提交等动作。
   - 是否需要用户确认。
5. Agent 执行低风险步骤：
   - 打开或切换 tab。
   - 读取当前页。
   - 生成 snapshot。
   - 找链接。
   - 点击低风险导航入口。
   - 输入低风险搜索词。
6. 遇到高风险动作时暂停并请求确认：
   - 登录。
   - 提交表单。
   - 发送消息。
   - 删除内容。
   - 修改账号设置。
   - 上传文件。
   - 付款、下单、checkout。
   - 运行任意 JavaScript。
   - 使用 raw debugger/CDP send。
7. Agent 汇总结果。
8. 用户可以继续追问、让 Agent 继续导航，或手动接管浏览器。

## 3. 系统内部执行流程

第一阶段仍保留当前 MVP 的可审计执行骨架：

1. Receive goal
   - 收集用户目标、当前 tab、时间、搜索偏好、已有对话上下文。

2. Classify intent
   - 判断是直接回答、当前页理解、站点概览、公共调研、购物搜索，还是通用浏览器动作任务。

3. Assess risk
   - 标记任务风险等级：safe、needs confirmation、blocked/out of scope。

4. Build initial plan
   - 生成静态初始 `PlanStep`。
   - 每个 step 只允许有限的 `allowedTools`。
   - 低风险通用浏览任务可以逐渐开放 browser tool。

5. Observe page
   - 当前默认用 content script 生成 `SemanticSnapshot`。
   - 下一阶段引入 `CdpDriver`，参考 ChromeClaw 的 CDP snapshot、refMap、screenshot、reattach。

6. Execute action
   - 高层 tool 调用低层 browser driver。
   - 低层动作返回 `ActionResult`。
   - runtime-visible tool 只返回高层 `ToolResult`。

7. Recover locally
   - 页面未就绪时短等待再扫描。
   - 弹窗遮挡时尝试一次关闭。
   - ref stale 时重新 snapshot。
   - CDP detached 时 reattach。
   - 单个来源失败时跳过并记录原因。

8. Publish state
   - Side Panel 展示当前步骤、动作、失败、预算、是否等待用户确认。

9. Stop or continue
   - 达到成功条件则生成 final result。
   - 预算耗尽、无进展、用户停止或高风险未确认时，生成 `partial / failed / blocked`。

10. Finalize
    - 输出结构化 `FinalResult`。
    - 保留来源、已完成步骤、失败步骤、blocker 和建议下一步。

## 4. 通用浏览器 Agent 的安全 Envelope

默认允许：

- 解释当前页面。
- 总结当前页面内容。
- 打开用户给定 URL。
- 切换或聚焦 tab。
- 截图当前页面。
- 找当前页链接。
- 点击明显低风险的导航链接。
- 在搜索框、筛选框等低风险输入框输入文本。
- 后退、刷新、打开新 tab。

需要确认：

- 提交任何表单。
- 登录或继续登录流程。
- 发送消息、邮件、评论。
- 修改账号资料或设置。
- 删除、归档、发布内容。
- 上传本地文件。
- 接受法律、金融、隐私、服务条款承诺。
- 购买、下单、付款、checkout。
- 运行任意 JavaScript。
- 暴露 raw debugger/CDP send。

默认不做：

- 绕过 CAPTCHA。
- 提取 cookies、token、密码或密钥。
- 后台无人值守长时间浏览。
- 深层全站 crawl。
- 真实支付或下单。
- 在未解释风险时接管敏感账号页面。

## 5. 能力演进路径

### Phase 1: 用 workflow 验证浏览器能力

目标：保留当前 MVP 主线，用明确 workflow 验证关键底层能力。

优先级：

1. 保持 `direct_answer / public_research / commerce_search / site_overview` 可运行。
2. 以 `site_overview explicit_url` 作为第一个 CDP 实验场。
3. 新增内部 `BrowserCapabilityLayer` 接口。
4. 保留 `ContentScriptDriver`。
5. 新增实验 `CdpDriver`。
6. 先实现 `openTab / navigate / snapshot / screenshot / readContent`。
7. 再加入低风险 `click / type`。

验收重点：

- 站点主页能打开。
- snapshot 能形成稳定 refs。
- 一跳站内链接能筛选。
- 正文能读取。
- 失败能解释。
- 最终输出仍是 `success / partial / failed / blocked`。

### Phase 2: 低风险通用浏览模式

目标：让用户开始用自然语言做通用浏览任务，但只开放低风险动作。

能力范围：

- 当前页问答。
- 当前页总结。
- 打开 URL。
- 找页面链接。
- 点击导航。
- 输入搜索词。
- 截图取证。
- 多轮继续任务。

关键 UI：

- 明确显示 Agent 正在控制哪个 tab。
- 明确显示下一步动作。
- 提供 stop。
- 高风险动作前暂停。
- 用户可手动接管。

### Phase 3: 受控动作执行

目标：把 click/type 从 workflow 内部能力逐步提升为通用 browser agent 能力。

需要补齐：

- 风险分类器。
- 高风险确认 UI。
- stale ref 自动恢复。
- 点击前可视性和 hit target 检查。
- action 后等待策略。
- 失败截图和 trace。
- 用户可回滚或继续。

开放顺序：

1. 导航链接点击。
2. 搜索框输入。
3. 筛选项点击。
4. 普通按钮点击。
5. 表单填写但不提交。
6. 表单提交前确认。

### Phase 4: 更通用的 Agent Loop

目标：逐步减少固定 workflow 的硬边界，让 Agent 自由组合 browser 能力，同时保留安全 envelope。

演进方式：

- 继续保留 `allowedTools`，但从 workflow step 限制，逐渐变为风险等级限制。
- 将 `PlanStep` 从固定流程改为可解释的当前意图和下一步。
- 将 workflow 中沉淀出的可靠子流程变成 reusable skills/tools。
- 允许 Agent 在低风险任务中自主选择 browser action。
- 高风险动作仍由 policy 和 confirmation gate 控制。

## 6. ChromeClaw 的作用

ChromeClaw 应作为以下方向的参考：

- CDP browser capability。
- debugger attach/reattach。
- DOM snapshot + refMap。
- screenshot result。
- tool call streaming。
- tool-loop detection。
- provider/model config。
- tool enable/disable settings。
- options layout。
- offscreen worker 管理。

ChromeClaw 暂不作为以下方向的直接来源：

- 完整 fork 基底。
- WhatsApp/Telegram channel。
- voice/TTS/STT。
- scheduler/cron。
- Google Gmail/Drive/Calendar。
- workspace files。
- long-term memory journal。
- raw execute JavaScript 默认能力。

## 7. 下一步建议

最小下一步：

1. 写 `BrowserCapabilityLayer` 接口草案。
2. 写 `CdpDriver` spike 计划。
3. 用 `site_overview explicit_url` 验证 CDP snapshot 和 screenshot。
4. 将 ChromeClaw 的 `cdpSendWithReattach` 思路重写进本项目。
5. 定义低风险通用浏览动作集。
6. 设计高风险确认 UI。
7. 跑 3 个公共站点样本，记录 content-script driver 与 CdpDriver 的差异。

当前不急于做：

- 重写整个 runtime。
- fork ChromeClaw。
- 引入所有 ChromeClaw 工具。
- 做深层全站 crawl。
- 开放 raw debugger/CDP send 给 LLM。
- 接入 cookies、identity、declarativeNetRequest。

## 8. 判断标准

继续推进通用浏览器 agent 的条件：

- CdpDriver 比当前 content script 更稳定地读取复杂页面。
- 用户能看懂 Agent 当前在做什么。
- 用户能随时停止或接管。
- 高风险动作不会无提示发生。
- 失败时有截图、日志或 blocker。
- final result 能清楚说明成功、部分成功、失败或阻塞。

如果这些条件不满足，继续用 workflow 限制能力边界；如果满足，就逐步把 workflow 中验证过的能力释放到通用浏览模式。
