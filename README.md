# Browser Agent MVP

一个基于 Chrome Extension 的浏览器 Agent MVP。

当前主线是：

`Agent = LLM + Tools + Memory + Runtime`

项目目标不是让 LLM 直接决定细粒度 DOM 动作，而是让：

- `LLM` 负责任务理解、任务路由、搜索词生成、最终总结
- `Tools` 负责导航、等待、提取、过滤、页面读取、失败恢复
- `Memory` 负责保存高价值结构化上下文
- `Runtime` 负责 phase 循环、状态推进、校验和容错

## 当前能力

- `commerce_search`
  - 用户目标 -> 小模型生成京东搜索词 -> 直达京东搜索结果页 -> 提取/过滤 -> 统一汇总
- `public_research`
  - 用户目标 -> 小模型判定为调研 -> 小模型生成 Google 查询词 -> 提取 Google 第一页自然结果 -> 过滤前 5 个候选 -> 串行读取来源页 -> 统一汇总

统一 phase：

- `planning -> searching -> extracting -> filtering -> aggregating -> done`
- `public_research` 额外包含 `reading`

## 当前已落地的关键点

- 单输入框，自动任务路由
- `commerce_search | public_research` 双任务类型
- 小模型优先任务路由，规则回退
- 小模型生成搜索词
- 统一 `aggregating` / final output 阶段
- Google 首屏候选过滤：去广告、去重、去 Google 内部页、去 PDF
- 来源页允许 `partial`，并显式输出 `unresolvedIssues`
- side panel 保持统一外壳，调试/日志/时间线默认折叠
- content script receiver 缺失时，runtime 会回退到 direct bridge，而不是直接失败

## 当前真实浏览器结论

扩展内部的 `"Could not establish connection. Receiving end does not exist."` 已修复。

当前真实浏览器里的主要阻断已经变成站点侧：

- 京东搜索可能跳到登录页
- Google 搜索可能返回 `sorry` 验证页

也就是说，当前主要瓶颈不再是扩展内部通信，而是目标站点的登录墙/风控。

## 开发命令

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
```

产物目录：

- `dist/`

Chrome 加载方式：

1. 打开 `chrome://extensions`
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 指向 `dist/`

## 目录

- `src/background/`
  - runtime、tool 调度、LLM 调用、过滤逻辑
- `src/content/`
  - 页面扫描、页面动作、Google/通用页面提取、direct bridge
- `src/sidepanel/`
  - side panel UI
- `src/shared/`
  - 共享 schema、常量、类型
- `tests/`
  - query/filter/runtime/research 回归测试
- `doc/`
  - 设计、现状、验收、踩坑记录

## 关键文档

- [设计真相](./doc/spec.md)
- [代码现状](./doc/status.md)
- [验收口径](./doc/acceptance.md)
- [踩坑记录](./doc/pitfalls.md)
- [线程启动上下文](./doc/thread_bootstrap.md)

Updated: 2026-04-02
