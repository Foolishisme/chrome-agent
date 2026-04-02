# Browser Agent 踩坑记录

## 1. 文档定位

本文件记录已经反复踩过、且后续很容易再次踩到的坑。

每条记录只关注四件事：

1. 现象
2. 根因
3. 当前处理原则
4. 仍需关注

## 2. 已确认的重要坑点

### 2.1 `build/test` 通过不代表真实浏览器闭环可用

现象：

- 代码能 build
- 单测能过
- 但真实浏览器里仍可能卡在扩展注入、站点重定向、登录墙或风控页

根因：

- 浏览器扩展的真实运行环境和单测环境差异很大
- 站点侧策略不会在本地单测里暴露

当前处理原则：

- 涉及主链的修改后，至少补一轮真实浏览器联调
- `build/test` 只能算基本门槛，不能直接当成闭环成功
- 验收状态统一落到 `doc/acceptance.md`

仍需关注：

- 当前京东和 Google 仍会在干净 profile 下触发站点阻断

### 2.2 让 LLM 直接决定细粒度 DOM 动作会让主链快速失稳

现象：

- 页面结构一变，主链就开始漂
- 讨论和实现会不断退化成“补一个 selector、再加一个 wait”

根因：

- 把 agent 错误理解成“LLM 决定每个 DOM 动作”
- 没有把等待、重试、提取、过滤这些脏活沉到 tool

当前处理原则：

- LLM 只做任务理解、任务路由、搜索词生成和最终总结
- tool 负责导航、等待、提取、过滤、局部恢复
- runtime 负责 phase 循环和校验

仍需关注：

- 当前仍是 phase/tool-first MVP，不是完整自由 planner

### 2.3 文档如果混写设计、现状和验收，会很快失真

现象：

- 不容易判断某个变化应该更新设计、现状还是验收
- 旧思路容易在新线程里持续污染讨论

根因：

- source of truth 没有分层

当前处理原则：

- `doc/spec.md` 只写设计真相
- `doc/status.md` 只写代码现状
- `doc/acceptance.md` 只写验收口径
- `doc/thread_bootstrap.md` 只写线程启动上下文

仍需关注：

- 设计发生明显切换时，仍要先归档旧文档再重写

### 2.4 搜索词既不能完全放给大模型，也不能过度规则化

现象：

- 完全放给主模型时，查询词容易被热门商品或热门答案带偏
- 过度规则化拆词时，又会破坏原始意图

根因：

- 搜索 query 是独立问题，不适合混在主链里随意发挥

当前处理原则：

- 用小模型专门做任务路由和 query compile
- query compile 失败时再做规则回退
- 不让主模型在主链中临场编 query

仍需关注：

- 小模型对模糊目标、品牌词、复合需求的稳定性还需继续观察

### 2.5 “等页面完全 ready” 是错误目标

现象：

- 动态页面可能一直在变，永远等不到理想化的“完全 ready”
- 最终只会带来长时间空等和无意义重扫

根因：

- 用静态爬虫思路理解浏览器 agent

当前处理原则：

- ready 的目标是“足够可用”，不是“完全稳定”
- 等待策略放到 tool 内部
- 采用短等待 + 短重试 + 快速失败

仍需关注：

- 不同页面类型的“足够可用”阈值还要继续用真实日志校准

### 2.6 `Receiving end does not exist` 不一定说明业务逻辑坏了

现象：

- 购物和调研都会在第一次扫页时报：
  - `Could not establish connection. Receiving end does not exist.`

根因：

- background 发消息时，tab 里没有可用的 content script receiver
- 这通常发生在注入时序、扩展重载、页面未刷新等场景

当前处理原则：

- 不再把 receiver 可用性当作主链前提
- runtime 在 receiver 缺失时直接回退到 direct bridge
- 通过 `chrome.scripting.executeScript + content-bridge.js` 直接执行扫描和动作

仍需关注：

- 这解决的是扩展内部通信问题，不解决站点登录墙和风控

### 2.7 `executeScript(content.js)` 不等于恢复了 `tabs.sendMessage` 通道

现象：

- 看起来脚本执行成功了
- 但 `tabs.sendMessage` 仍然可能收不到 receiver

根因：

- “把 content script 再执行一次”和“恢复 Chrome content-script 消息接收端”不是同一件事

当前处理原则：

- 不再把“补注入 content.js”当唯一修复方案
- 直接提供独立的 `content-bridge.js`
- 由 runtime 通过 bridge 直接拿扫描和动作结果

仍需关注：

- 这条桥接链路仍然依赖脚本可注入，非 `http/https` 页面仍不是目标范围

### 2.8 真实浏览器里“搜索打不开结果页”可能是站点阻断，不是扩展 bug

现象：

- 京东搜索可能跳登录页
- Google 搜索可能进入 `sorry` 验证页
- 表面上看像是搜索 tool 失效，实际上是站点把请求挡住了

根因：

- 干净浏览器 profile 没有日常会话和信任上下文
- 目标站点的登录策略、验证策略和反爬策略共同影响最终落地页

当前处理原则：

- 先区分“扩展内部通信失败”和“站点阻断”
- 当前 runtime 已显式识别：
  - `JD redirected the search to a login page.`
  - `Google returned a verification page and blocked the search results.`
- 不再把这类问题伪装成通用提取失败

仍需关注：

- 后续需要决定 blocked-page 是报错、partial，还是引导用户在已登录环境运行

### 2.9 前端不应承载过多业务假设

现象：

- 一旦结果结构变化，side panel 很容易先崩
- 表面看像 runtime 卡住，实际上是前端渲染假设过重

根因：

- UI 与业务结构绑定过死

当前处理原则：

- side panel 只做通用展示壳子
- 结果按 `taskType` 分流渲染
- timeline / logs / debug / source detail 默认折叠

仍需关注：

- Markdown 渲染和复杂结构展示目前仍是轻量方案

## 3. 当前仍需持续观察的风险

### 3.1 小模型路由与 query compile 的稳定性

需要继续观察：

- 模糊目标是否会误路由
- 商品意图和调研意图的边界是否稳定
- query 是否会被品牌词或热门答案带偏

### 3.2 site adapter 还未正式抽象

需要继续观察：

- 当前 scanner 分支逻辑是否会继续膨胀
- 扩站点时是否应立即拆正式 adapter

### 3.3 真实浏览器闭环仍不足

需要继续关注：

- 已登录京东环境下的 commerce 闭环
- 可用 Google 会话环境下的 research 闭环
- side panel 的完整 UI 联调

## 4. 后续记录规则

后续新增踩坑记录时，统一包含：

1. 现象
2. 根因
3. 当前处理原则
4. 仍需关注

如能定位来源，额外补充：

- 对应模块
- 对应文档
- 对应验证方式

Updated: 2026-04-02
