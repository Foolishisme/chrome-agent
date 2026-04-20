# Browser Agent 产品流程与推进路径

Updated: 2026-04-20

## 1. 定位

目标产品是面向大众用户的通用浏览器 Agent。

它不是固定 workflow 集合，也不是单纯的 CDP/Playwright 替代品。当前主线是 `Browser Core V2`：在现有仓库里建立隔离的参考重写岛，用 store-safe JS/DOM 能力先跑通通用浏览器 Agent 的最小闭环。

当前默认路径：

- `StoreSafeDriver`
- content-script JS/DOM snapshot
- `@mozilla/readability + turndown`
- Vanilla JS click/type/press/scroll
- 原生事件兼容 React/Vue SPA
- 高风险动作前确认

后置路径：

- CDP/debugger 只作为 advanced/local/enterprise driver。
- memory、subagent、cron、channels、Google identity 等不属于当前第一差距。
- 下载能力后续通过 `chrome.downloads` 单独评估，不进入第一闭环。

## 2. 用户侧流程

用户看到的产品流程应收敛为：

1. 用户打开 Side Panel。
2. 用户输入自然语言目标，例如：
   - “概览这个网站主要提供什么。”
   - “帮我看当前页面讲了什么。”
   - “找到官网里的价格/文档/联系我们。”
   - “在这个页面里找搜索框并输入关键词。”
3. Agent 判断目标、页面范围和风险等级。
4. Agent 告知准备读取或操作的范围。
5. Agent 执行低风险浏览动作：
   - 打开 URL。
   - 聚焦或切换 tab。
   - 等待页面稳定。
   - 观察 DOM snapshot。
   - 读取正文。
   - 提取 links 和 controls。
   - 点击低风险导航链接。
   - 在搜索框等低风险输入框输入文本。
6. 遇到高风险动作时暂停：
   - 登录。
   - 提交表单。
   - 发送消息、邮件、评论。
   - 删除、发布、归档。
   - 支付、下单、checkout。
   - 上传本地文件。
   - 运行任意脚本。
7. 用户确认、拒绝、停止或手动接管。
8. Agent 输出结果，说明来源、覆盖边界、失败项和建议下一步。

## 3. 系统内部流程

默认流程：

1. Runtime 创建 session，注入用户目标、当前 tab、绝对时间、权限状态和安全边界。
2. LLM 形成轻量工作假设：搜索、打开 URL、读取页面、比较、操作或直接回答。
3. LLM 调用稳定 browser tool，而不是编排 raw DOM 步骤。
4. Browser tool 调用 `BrowserCapabilityLayer`。
5. `StoreSafeDriver` 通过 content script 执行 JS/DOM 能力。
6. Content primitives 返回短结构化结果：
   - page state
   - readable markdown excerpt
   - DOM snapshot
   - links
   - controls
   - page problems
7. Tool 内部处理等待、重试、stale ref、fallback、裁剪和 result shaping。
8. LLM 基于少量高价值 observation 决定继续、停止或汇总。
9. Runtime 只负责预算、停止、loop guard、状态广播和 final result 兜底。
10. 最终状态统一为 `success / partial / failed / blocked`。

## 4. 为什么 ChromeClaw 感觉快

ChromeClaw 的速度主要不是因为“想得更多”，而是因为：

- 工具能力厚，很多恢复和裁剪在 tool 内完成。
- 大量浏览器结果获取和执行可以并行或批量化。
- LLM 只做少数高价值决策。
- 流式输出让用户更早看到进度。
- 页面结果会被裁剪、摘要或结构化，减少上下文噪音。

我们当前差距优先级：

1. browser tools。
2. 页面裁剪和结构化。
3. tool 内恢复重试。
4. Agent Loop V2 minimal。
5. memory 和 subagent 后置。

## 5. Browser Core V2 文件策略

新主线放在：

`D:\code\browser-agent-mvp\src\browser-core-v2`

这是参考重写岛，不是旧主目录内大重构。

旧代码保留：

- provider / side panel / result contract。
- `ToolResult / ActionResult / FinalResult`。
- `SemanticSnapshot`。
- `SourceFactCard`。
- `success / partial / failed / blocked`。
- `site_overview explicit_url` 验证经验。
- 当前 workflow 作为 harness/fallback/历史参考。

新目录负责：

- store-safe browser capability。
- DOM snapshot。
- readable content。
- markdown excerpt。
- stable refs。
- links/controls extraction。
- low-risk interaction primitives。
- browser tool schema。
- explicit URL overview 新闭环。

## 6. 推进阶段

### Phase 0: Contract and Mock Harness

状态：已落地。

内容：

- `BrowserCapabilityLayer`
- `BrowserDriver`
- shared browser action/result/problem 类型
- `MockBrowserDriver`
- Phase 0 单测

### Phase 1: Browser Core V2 File Framework

状态：当前完成。

内容：

- `src/browser-core-v2` 隔离目录。
- content primitives。
- background facade/driver 框架。
- `turndown` 依赖。
- 最小单测。

不做：

- 不注册旧 runtime tool。
- 不加载真实扩展。
- 不请求 `debugger`。
- 不请求 `downloads`。

### Phase 2: StoreSafeDriver Wiring

目标：

- 接 `chrome.tabs / chrome.scripting`。
- content bridge 真正注入页面。
- `open / navigate / observe / read / extractLinksAndControls` 可用。
- explicit URL overview 可不走旧 workflow 独立完成。

### Phase 3: Agent Loop V2 Minimal

目标：

- LLM 基于 browser tool loop 决定下一步。
- Runtime 只做预算、停止、状态广播和兜底。
- 旧 workflow 只作为对照，不作为新主链。

### Phase 4: Tool Hardening

目标：

- stale ref 恢复。
- 页面稳定等待。
- 一跳读取。
- result trimming。
- partial success。
- 页面问题识别。

### Phase 5: Low-risk Interaction

目标：

- click/type/press/scroll 低风险子集。
- action 前后 observe。
- 高风险确认。
- stop/takeover。

### Phase 6: Advanced Drivers

目标：

- `CdpDriver` 作为 advanced/local/enterprise driver。
- 参考 ChromeClaw 的 CDP attach/reattach、snapshot、screenshot、Input fallback。
- 不作为大众/商店默认路径。

## 7. 第一闭环

默认第一闭环：

`explicit_url overview via StoreSafeDriver`

成功标准：

- 输入明确 URL。
- Store-safe path 打开或导航页面。
- content script 返回 DOM snapshot。
- Readability/Turndown 返回短 markdown excerpt。
- links/controls 有稳定 refs。
- LLM 决定是否读取一跳链接或汇总。
- 最终输出来源、覆盖边界、失败项和建议下一步。
- 不依赖 `debugger` / CDP。

## 8. 安全 Envelope

默认允许：

- 当前页解释。
- 当前页总结。
- 打开用户给定 URL。
- 读取页面正文。
- 提取链接和控件。
- 点击明显低风险导航链接。
- 在搜索框、筛选框等低风险输入框输入文本。
- 滚动、刷新、切换 tab。

需要确认：

- 登录或继续登录。
- 提交表单。
- 发送消息、邮件、评论。
- 修改账号资料或设置。
- 删除、归档、发布内容。
- 上传本地文件。
- 支付、下单、checkout。
- 执行任意脚本。
- 使用 raw debugger/CDP send。

默认不做：

- 绕过 CAPTCHA。
- 提取 cookies、token、密码或密钥。
- 后台无人值守长时间浏览。
- 深层全站 crawl。
- 真实支付或下单。
- 未解释风险时接管敏感账号页面。
