# Browser Agent 当前代码现状

## 1. 文档定位

本文件描述当前代码相对于最新设计主线的真实位置。

关注点只有两类：

- 现在代码已经做到哪里
- 距离目标架构还差什么

## 2. 当前真实定位

当前项目已经不是旧版“LLM 直接驱动细粒度 DOM 动作”的思路。

更准确地说，当前代码是：

`task-typed tool-first MVP`

它已经具备：

- `commerce_search | public_research` 双任务类型
- 小模型优先任务路由
- 小模型生成搜索词
- phase 驱动的高阶 tool 循环
- 独立 `aggregating` 阶段
- research 候选过滤、来源读取、partial 收口

但它还不是：

- 完整的自由 planner
- 完整的 subtask-based agent
- 带 checkpoint 恢复的运行时

## 3. 已落地能力

### 3.1 runtime / planning

当前已落地：

- `TaskType = "commerce_search" | "public_research"`
- `TaskPlan / SubtaskSpec / SubtaskResult / FinalResult`
- 小模型优先路由，规则回退
- 固定 phase：
  - commerce：`planning -> searching -> extracting -> filtering -> aggregating -> done`
  - research：`planning -> searching -> extracting -> filtering -> reading -> aggregating -> done`

对应模块：

- `src/background/runtime.ts`
- `src/background/query-compiler.ts`
- `src/shared/types.ts`

### 3.2 research 主链

当前已落地：

- Google 搜索 URL 直达
- 只取第一页自然结果
- 过滤后保留前 5 个候选
- 串行读取来源页
- PDF / 登录墙 / 强交互 SPA / 不可读页 -> `partial`
- 最终输出统一包含结论、来源、未解决问题

对应模块：

- `src/background/tools.ts`
- `src/background/result-filter.ts`
- `src/content/research.ts`

### 3.3 统一最终输出

当前 commerce 与 research 都通过统一的 `aggregateTaskResults` 收口。

当前已落地：

- `overallStatus = success | partial | failed`
- `finalOutput` / `finalResult`
- research 的 `unresolvedIssues`

这意味着“最后一步总结”已经不再散落在旧主链里。

### 3.4 页面扫描与 direct bridge

当前扫描框架仍是统一入口，但已按页面类型分流：

- 京东搜索页
- Google 搜索结果页
- 通用内容页
- PDF 页

同时，runtime 已增加 direct bridge 兜底：

- 当 `tabs.sendMessage` 报 receiver 缺失时
- 通过 `chrome.scripting.executeScript` 加载 `content-bridge.js`
- 直接执行页面扫描和动作

对应模块：

- `src/background/runtime.ts`
- `src/content/bridge.ts`
- `public/manifest.json`
- `vite.config.ts`

## 4. 本轮真实浏览器联调结果

### 4.1 已确认修复

此前两个任务都会在扫页阶段报：

- `Could not establish connection. Receiving end does not exist.`

现在这个扩展内部错误已修复。

验证方式：

- `npm.cmd test`
- `npm.cmd run build`
- Playwright 真实浏览器加载 `dist/` 扩展联调

### 4.2 当前暴露出的真实阻断

修复内部通信后，当前真实浏览器里的主要阻断变成了目标站点本身：

- `commerce_search`
  - 京东搜索可能跳转到登录页
  - runtime 现在会显式报：`JD redirected the search to a login page.`
- `public_research`
  - Google 搜索可能进入 `sorry` 验证页
  - runtime 现在会显式报：`Google returned a verification page and blocked the search results.`

这说明当前第一阻断已从“扩展内部消息链路”转移到“站点登录墙 / 风控页”。

## 5. 当前仍未完成的部分

### 5.1 memory / checkpoint

还未正式落地：

- `global memory + subtask memory`
- `chrome.storage.local` checkpoint
- 中断恢复

### 5.2 真正稳定的真实浏览器闭环

当前还没有在干净 profile 下得到稳定闭环：

- 京东会因登录/风控阻断 commerce 搜索
- Google 会因验证页阻断 research 搜索

所以当前不能把“真实站点闭环成功”写成已完成。

### 5.3 site adapter 仍未正式抽象

当前仍是统一 scanner 框架下的分支判断，而不是正式 adapter 架构。

后续若继续扩展，需要进一步拆出：

- JD adapter
- Google SERP adapter
- generic content adapter

## 6. 当前建议理解

当前项目最准确的判断是：

- 方向已经从旧 DOM agent 切出来了
- phase/tool-first 主链已经成型
- dual taskType + unified aggregation 已经落地
- receiver 缺失问题已修复
- 当前真实浏览器阻断主要来自站点，而不是扩展内部通信

## 7. 下一步最小重点

建议优先级：

1. 明确 blocked-page 的产品策略
2. 在可控会话环境下完成京东 / Google 真机闭环验证
3. 再决定是否推进 checkpoint 与 subtask memory
4. 最后再考虑更彻底的 adapter 抽象和并行子任务

Updated: 2026-04-02
