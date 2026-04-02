# Browser Agent Agent Guide

## 1. 核心定义

本项目当前主线只有一个核心定义：

`Agent = LLM + Tools + Memory + Runtime`

其中：

- `LLM` 负责任务理解、任务类型判断、查询词生成、最终结果汇总
- `Tools` 负责页面操作、等待、提取、过滤、逐页读取、局部恢复
- `Memory` 只保留结构化状态，不保留低价值页面噪音
- `Runtime` 负责 phase 驱动的确定性循环、校验、容错和状态广播

## 2. 当前范围

当前代码支持两类任务：

- `commerce_search`
  - 面向京东站内商品搜索、提取、过滤和推荐输出
- `public_research`
  - 面向 Google 公网搜索、来源筛选、逐页读取和调研汇总

当前不应假设：

- 已支持多站点通用 adapter
- 已支持 LLM 自由决定任意下一步工具
- 已支持下单、支付或其他高风险执行

## 3. 文档入口

优先读取以下文档：

- [doc/spec.md](./doc/spec.md)
- [doc/thread_bootstrap.md](./doc/thread_bootstrap.md)
- [doc/status.md](./doc/status.md)
- [doc/acceptance.md](./doc/acceptance.md)
- [doc/writing_rules.md](./doc/writing_rules.md)
- [doc/pitfalls.md](./doc/pitfalls.md)

说明：

- `README.md` 是项目总览，不是设计真相
- 设计、现状、验收以 `doc/` 下对应文档为准
- `doc/pitfalls.md` 是专题复盘文档，用于记录已确认坑点、原因和处理方法

## 4. 工作约束

处理任务时优先遵守：

- 先判断当前任务属于 `commerce_search` 还是 `public_research`
- 优先最小必要改动，不擅自重构无关文件
- 不让 `LLM` 承担细粒度 DOM 动作、等待、基础过滤
- 不把代码可直接得到的页面事实重复塞给 `LLM`
- 信息不足时先明确不确定性，不自行发明业务规则

## 5. 文档更新规则

按职责更新，不要混写：

- 设计变化：更新 `doc/spec.md`
- 新线程启动上下文变化：更新 `doc/thread_bootstrap.md`
- 代码现状变化：更新 `doc/status.md`
- 验收口径或验收状态变化：更新 `doc/acceptance.md`
- 文档写法或拆分规则变化：更新 `doc/writing_rules.md`
- 踩坑复盘、原因分析或处理原则沉淀：更新 `doc/pitfalls.md`

如果发生范式切换，先归档旧文档到 `doc/history/`。

## 6. 当前阶段判断题

任何新实现都应先回答：

- 这件事该由 `LLM` 做，还是该封进 `Tool`
- 这段上下文是否值得进入 `Memory`
- 这一步是否必须进入 `Runtime` 主循环
- 这次变更应更新哪一份文档，而不是顺手改很多份

Updated: 2026-04-02
