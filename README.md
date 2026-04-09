# Browser Agent MVP

一个基于 Chrome Extension Manifest V3 的浏览器 Agent MVP。

当前主线定义：

`Agent = LLM + Tools + Memory + Runtime`

当前执行范式：

`LLM plan-driven tool orchestration`

## 当前能力

当前已支持三个任务模块：

- `direct_answer`
  - 面向简单稳定知识问答、已搜索且证据充足后的追问，以及无需再开浏览器的直接回答
- `commerce_search`
  - 面向京东站内商品搜索、提取、过滤和推荐输出
- `public_research`
  - 面向 Google 公网搜索、来源筛选、逐页读取和调研汇总

当前系统已经具备：

- Side Panel 发起和停止会话
- Lite model 参与任务分类、是否需要搜索判断、查询词生成和下一步 tool 选择
- 搜索偏好开关：`智能回答 / 优先搜索`
- `PlanStep + allowedTools` 驱动的高层执行循环
- 最小运行护栏
  - 软提示：`15 steps` 或 `120s`
  - 硬停止：`20 steps` 或 `180s`
- 会话区已收口为当前与历史共用的 turn 流
- `inline` 成功结果不再重复占用独立结果面板

## 当前不应假设

当前不应把项目理解为：

- 多站点通用浏览器代理
- 向 LLM 开放 raw DOM 原子动作的通用执行器
- 已支持复杂的执行中 plan 改写
- 已支持下单、支付等高风险动作
- 已完成全部真机与 provider 联调验收的生产系统

## 架构分工

### LLM

负责：

- 任务理解
- 初始 plan 编译
- 判断当前问题是否需要搜索，还是可以直接回答
- 在当前 `allowedTools` 内选择下一步 tool
- 最终结果汇总

不负责：

- raw DOM 动作
- selector 选择
- 页面等待与局部恢复

### Tools

当前高层工具位于 [src/background/tools.ts](./src/background/tools.ts)：

- `compileTaskSpec`
- `finalizeDirectAnswer`
- `openSearchResults`
- `collectCommerceCandidates`
- `collectResearchCandidates`
- `readResearchSourceFacts`
- `finalizeCommerceResult`
- `finalizeResearchResult`

它们负责稳定语义能力、局部恢复和结构化结果返回。

### Memory

保留结构化工作记忆，例如：

- `taskType`
- `searchPreference`
- `taskSpec`
- `plan`
- `toolHistory`
- `conversationTurns`
- `extractedItems`
- `researchCandidates`
- `researchSources`
- `finalResult`

### Runtime

负责：

- 会话生命周期
- `PlanStep` 执行推进
- 预算与停止护栏
- 状态广播
- 错误兜底和终态结果补齐

## UI

当前 Side Panel 以对话区为主：

1. `对话流`
2. `运行状态`
   - 仅服务当前正在执行的 session
3. `结果操作`
   - 仅保留复制、文档产物等当前轮操作

## 当前验证状态

代码侧已验证：

- `npm.cmd test`
- `npm.cmd run build`

实机侧：

- `commerce_search / public_research` 当前线程已通过用户实机验证，记录为 `user-reported`
- 具体模块级验收状态以 [doc/acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md) 为准

## 下一步计划

这一块只用于提醒当前主线还没收口的事情，避免后续遗忘：

1. 记录 `stop / error / budget` 护栏的真机表现。
2. 记录 `direct_answer / prefer_search` 的真机连续追问样本与误判样本。
3. 记录 `public_research` 第一页重排前后的成功来源命中率。
4. 做 Gemini / DeepSeek provider 的联调确认。
5. 打通自动化真机扩展验证链路。
6. 根据后续真实失败模式，再决定是否继续细拆 tool 或扩展 PDF artifact。

## 开发命令

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

构建扩展：

```bash
npm run build
```

开发模式：

```bash
npm run dev
```

## 环境变量

参考 [`.env.example`](./.env.example)：

```env
VITE_LLM_PROVIDER=gemini
VITE_GEMINI_API_KEY=
VITE_GEMINI_MODEL=gemini-2.0-flash
VITE_GEMINI_SIMPLE_MODEL=gemini-3.1-flash-lite-preview
VITE_GEMINI_SIMPLE_MODEL_FALLBACK=gemini-2.5-flash-lite
VITE_DEEPSEEK_API_KEY=
VITE_DEEPSEEK_MODEL=deepseek-chat
```

## 加载到 Chrome

1. 运行 `npm run build`
2. 打开 Chrome 扩展管理页
3. 开启开发者模式
4. 选择“加载已解压的扩展程序”
5. 选择项目下的 `dist/` 目录

## 文档入口

设计、约束、路径、现状和验收以 `doc/` 下文档为准：

- [spec.md](./doc/spec.md)
- [constraints.md](./doc/constraints.md)
- [plan.md](./doc/plan.md)
- [thread_bootstrap.md](./doc/thread_bootstrap.md)
- [status.md](./doc/status.md)
- [acceptance.md](./doc/acceptance.md)
- [writing_rules.md](./doc/writing_rules.md)
- [pitfalls.md](./doc/pitfalls.md)

Updated: 2026-04-09

## 更新说明

- 最终结果合成现在统一通过一个通用的结构化 LLM 提示词入口 (entrypoint)。
- 结果面板优先渲染最终的 markdown，并针对 items、sources 和未解决问题提供了可选的结构化详情。
- 引入了 V1 轻量级 `semanticSnapshot` 作为类似 AX 的观察层，同时不替换现有的 commerce 和 research 提取器。
- 增加了 V1 确定性恢复路径：
  - 页面未就绪时的短时等待并重新扫描
  - one-shot `RECOVER_CLOSE_DIALOG`
  - one-shot 规范化搜索页重新打开
  - 针对 `public_research` 的单个信息源跳过策略
- 当前自动化验证状态：
  - `npm.cmd test`: `12` 个测试文件, `84` 个测试通过
  - `npm.cmd run build`: 通过

Updated: 2026-04-07

## 近期 UI 说明 (2026-04-08)

- 会话面板现在将同一 shared turn stream 用于当前和历史会话。
  - 打开历史记录仅仅切换底层的会话数据。
  - 历史抽屉 (history drawer) 现在仅用于会话管理：列表、创建、切换、删除。
- 输入框现在作为本地草稿处理。
  - 它不再从最新归档的 `goal` 回填数据。
  - 初始占位符 (placeholder) 为“你想知道什么”。
  - 后续的 turn 默认从空白开始。
- 每个已归档的 turn 现在保留它自己的执行时间线。
  - 历史执行过程显示在该 turn 下方。
  - 全局运行状态面板仅用于当前正在运行的会话。
- 结果面板现在收敛为仅展示当前 turn 的操作。
  - 如果最终的 final answer 正文已显示在会话流中，结果面板不再重复显示它。
  - 历史 turns 保留其自己的 copy 操作。

Updated: 2026-04-08
