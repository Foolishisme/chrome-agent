# Browser Agent MVP

一个基于 Chrome Extension Manifest V3 的浏览器 Agent MVP。

当前主线定义：

`Agent = LLM + Tools + Memory + Runtime`

当前执行范式：

`LLM plan-driven tool orchestration`

## 当前能力

当前已支持两个任务模块：

- `commerce_search`
  - 面向京东站内商品搜索、提取、过滤和推荐输出
- `public_research`
  - 面向 Google 公网搜索、来源筛选、逐页读取和调研汇总

当前系统已经具备：

- Side Panel 发起和停止会话
- Lite model 参与任务分类、查询词生成和下一步 tool 选择
- `PlanStep + allowedTools` 驱动的高层执行循环
- 最小运行护栏
  - 软提示：`15 steps` 或 `120s`
  - 硬停止：`20 steps` 或 `180s`
- 三段式 UI
  - `对话`
  - `运行状态`
  - `结果`

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
- 在当前 `allowedTools` 内选择下一步 tool
- 最终结果汇总

不负责：

- raw DOM 动作
- selector 选择
- 页面等待与局部恢复

### Tools

当前高层工具位于 [src/background/tools.ts](./src/background/tools.ts)：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `readPageFacts`
- `aggregateTaskResults`

它们负责稳定语义能力、局部恢复和结构化结果返回。

### Memory

保留结构化工作记忆，例如：

- `taskType`
- `taskSpec`
- `plan`
- `toolHistory`
- `extractedItems`
- `researchCandidates`
- `researchSources`
- `finalOutput`

### Runtime

负责：

- 会话生命周期
- `PlanStep` 执行推进
- 预算与停止护栏
- 状态广播
- 错误兜底和终态结果补齐

## UI

当前 Side Panel 展示结构：

1. `对话`
2. `运行状态`
   运行状态下可折叠查看：
   - `执行时间线`
   - `调试日志`
3. `结果`

## 当前验证状态

代码侧已验证：

- `npm.cmd test`
- `npm.cmd run build`

实机侧：

- 当前线程已通过用户实机验证
- 具体模块级验收状态以 [doc/acceptance.md](D:/code/browser-agent-mvp/doc/acceptance.md) 为准

## 下一步计划

这一块只用于提醒当前主线还没收口的事情，避免后续遗忘：

1. 补 `no progress / 连续失败` 护栏。
2. 补 `commerce_search` 的实机闭环记录。
3. 专门验证 `stop / error` 路径下结果区的最终展示。
4. 做 Gemini / DeepSeek provider 的联调确认。
5. 继续收口高层 tool 返回契约，逐步减少 `currentPhase` 兼容依赖。
6. 根据后续真机反馈，再决定是否继续细拆 tool，而不是提前拆分。

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

Updated: 2026-04-03
