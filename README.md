# Browser Agent MVP

一个基于 Chrome Extension Manifest V3 的浏览器 Agent MVP。

当前项目聚焦“京东单站点购物搜索”场景，目标不是做一个已经完全通用化的浏览器代理，而是先把一条可运行、可调试、可继续演进的 agent 主线跑通。

项目当前设计主线为：

`Agent = LLM + Tools + Memory + Runtime`

## 项目目标

- 接收用户自然语言购物意图
- 用小模型生成更适合京东站内搜索的搜索词
- 在京东页面执行搜索
- 提取并过滤结构化商品候选
- 由 LLM 生成最终 Markdown 推荐结果

## 当前范围

当前实现优先支持：

- 京东首页与搜索结果页
- Side Panel 启动 session
- 高阶 tool 驱动的搜索、提取、过滤、总结流程
- Gemini / DeepSeek 两种 LLM provider

当前还不属于本项目已完成范围：

- 多站点通用搜索
- LLM 动态选择任意下一步 tool
- 完整真机稳定性验收

## 核心架构

### 1. LLM

负责：

- 将用户意图改写为京东站内搜索词
- 基于过滤后的结构化候选生成最终推荐结果

不负责：

- 细粒度 DOM 操作
- 页面等待与重试
- 商品结构化提取
- 基础去重与基础过滤

### 2. Tools

当前主链的高阶 tools 位于 `src/background/tools.ts`，包括：

- `compileTask`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `finishWithSummary`

这些 tools 封装了搜索执行、提取、过滤、局部恢复等脏活。

### 3. Memory

Memory 保存高价值结构化上下文，例如：

- 当前 phase
- tool history
- 当前事实
- 已提取候选
- 失败记录
- 最终输出

### 4. Runtime

Runtime 负责：

- session 生命周期
- phase/tool 调度
- 状态广播
- 错误处理
- 停止与恢复控制

## 当前搜索链路

当前搜索主链已经收敛为：

1. 用户输入自然语言目标
2. 小模型直接生成京东搜索词
3. 将搜索词写入京东搜索框并提交
4. 提取搜索结果页的结构化商品列表
5. 代码侧完成去重、基础过滤与候选截断
6. LLM 基于候选生成最终 Markdown 输出

说明：

- 搜索词不再依赖规则拼装 query
- prompt 中加入了 one-shot 样本，用于把宽泛需求收敛成更适合站内搜索的短词
- 提取数量、LLM 输入数量、最终展示数量已经解耦

## 目录结构

```text
.
├─ public/
│  ├─ manifest.json
│  ├─ sidepanel.html
│  └─ sidepanel.css
├─ src/
│  ├─ background/    # runtime、tools、query planner、LLM client
│  ├─ content/       # 页面扫描、动作执行、商品提取、overlay
│  ├─ shared/        # 协议、schema、常量、类型
│  └─ sidepanel/     # Side Panel UI
├─ tests/            # 单元测试
└─ doc/              # 设计、现状、验收文档
```

## 环境变量

参考 [`.env.example`](/D:/code/browser-agent-mvp/.env.example)：

```env
VITE_LLM_PROVIDER=gemini
VITE_GEMINI_API_KEY=
VITE_GEMINI_MODEL=gemini-2.0-flash
VITE_GEMINI_SIMPLE_MODEL=gemini-3.1-flash-lite-preview
VITE_GEMINI_SIMPLE_MODEL_FALLBACK=gemini-2.5-flash-lite
VITE_DEEPSEEK_API_KEY=
VITE_DEEPSEEK_MODEL=deepseek-chat
```

说明：

- `VITE_LLM_PROVIDER` 可选 `gemini` 或 `deepseek`
- 如果未显式指定 provider，代码会按当前实现选择可用 provider

## 开发与构建

安装依赖：

```bash
npm install
```

执行测试：

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
3. 开启“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择项目下的 `dist/` 目录

## 文档入口

设计与现状以 `doc/` 为准：

- [设计规范](/D:/code/browser-agent-mvp/doc/spec.md)
- [线程启动上下文](/D:/code/browser-agent-mvp/doc/thread_bootstrap.md)
- [当前代码现状](/D:/code/browser-agent-mvp/doc/status.md)
- [当前验收清单](/D:/code/browser-agent-mvp/doc/acceptance.md)

## 当前限制与下一步

当前主要限制：

- 仍是京东单站点优先
- 仍是 phase-driven tool loop
- 还没有把站点逻辑正式抽为 site adapter
- 真实页面上的稳定性仍需持续验收

下一步更适合继续推进的方向：

- 京东真机闭环验证
- 基于真实日志微调页面选择器与提取策略
- 把站点能力收敛为 site adapter
- 再考虑升级为 LLM-driven tool selection
