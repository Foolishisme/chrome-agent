# Browser Agent MVP

一个基于 Chrome Extension Manifest V3 的浏览器 Agent MVP。

项目当前主线是：

`Agent = LLM + Tools + Memory + Runtime`

目标不是一次性做成通用浏览器代理，而是先把可运行、可验证、可继续演进的主链跑通。

## 当前支持

当前代码支持两类任务：

- `commerce_search`
  - 面向京东站内商品搜索、结构化提取、过滤和推荐输出
- `public_research`
  - 面向 Google 公网搜索、来源筛选、逐页读取和调研汇总

当前范围内已具备：

- Side Panel 发起 session
- lite model 参与任务分类和查询词生成
- phase-driven 的高阶 tool 主循环
- Gemini / DeepSeek provider 接入

## 当前不做什么

当前不应把项目理解为：

- 多站点通用浏览器代理
- LLM 自由规划任意下一步动作的开放式 agent
- 自动下单、支付或其他高风险执行器
- 已完成真机稳定性验收的生产系统

## 核心架构

### LLM

负责：

- 任务类型判断
- 查询词生成
- 最终结果汇总

不负责：

- 细粒度 DOM 操作
- 页面等待与重试
- 结构化提取
- 基础去重与基础过滤

### Tools

当前主链的高阶工具位于 `src/background/tools.ts`：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `readPageFacts`
- `aggregateTaskResults`

### Memory

保存结构化状态，例如：

- `taskType`
- `taskSpec`
- `currentPhase`
- `toolHistory`
- `extractedItems`
- `researchCandidates`
- `researchSources`
- `failures`
- `finalOutput`

### Runtime

负责：

- session 生命周期
- phase 驱动的工具调度
- 状态广播
- 结果校验
- 容错与停止控制

## 当前任务链路

### Commerce

1. 用户输入购物目标
2. lite model 生成京东搜索词
3. 在京东搜索结果页执行搜索
4. 提取商品候选
5. 代码侧完成去重与过滤
6. LLM 输出最终推荐 Markdown

### Public Research

1. 用户输入调研目标
2. lite model 生成 Google 查询词
3. 打开 Google 第一页结果
4. 提取并过滤候选来源
5. 串行读取来源页并提取事实
6. LLM 输出调研总结与来源概览

## 目录结构

```text
.
├─ public/           # manifest 与 side panel 静态资源
├─ src/background/   # runtime、tools、query compiler、LLM client
├─ src/content/      # 页面扫描、动作执行、商品提取、研究页提取
├─ src/shared/       # 类型、schema、常量、协议
├─ src/sidepanel/    # Side Panel UI
├─ tests/            # 自动化测试
└─ doc/              # 设计、现状、验收与写作规范
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

监听构建：

```bash
npm run dev
```

## 在 Chrome 中加载

1. 运行 `npm run build`
2. 打开 Chrome 扩展管理页
3. 开启开发者模式
4. 选择“加载已解压的扩展程序”
5. 选择项目下的 `dist/` 目录

## 文档入口

以 `doc/` 下文档为准：

- [设计规范](./doc/spec.md)
- [新线程启动词](./doc/thread_bootstrap.md)
- [当前代码现状](./doc/status.md)
- [当前验收清单](./doc/acceptance.md)
- [文档写作规范](./doc/writing_rules.md)
- [踩坑记录](./doc/pitfalls.md)

## 当前状态

当前项目已经具备双任务类型的代码主链，但仍处于“自动化验证已具备、真机闭环仍需继续验收”的阶段。

更具体的事实和验收状态请看：

- [status.md](./doc/status.md)
- [acceptance.md](./doc/acceptance.md)

Updated: 2026-04-02
