# Browser Agent 踩坑记录

## 1. 文档定位

本文档记录项目在设计和实现过程中已经反复踩过的坑，以及当前形成的处理原则。

它不重复 [`spec.md`](/D:/code/browser-agent-mvp/doc/spec.md) 的目标设计，也不替代 [`status.md`](/D:/code/browser-agent-mvp/doc/status.md) 的代码现状，而是保留一份偏工程复盘视角的经验记录，便于后续迭代时快速判断：

- 当前问题是不是旧坑重演
- 这个坑最初为什么会出现
- 现在的主处理原则是什么
- 还有哪些地方没有彻底解决

---

## 2. 已明确踩过的坑

### 2.1 初版在没有真机闭环验证前就持续推进

来源：
- `9b778bb` `进行初版开发MVP未进行验证。`
- [`acceptance.md`](/D:/code/browser-agent-mvp/doc/acceptance.md)

现象：
- 代码和文档推进很快，但 Chrome 真机闭环没有同步完成
- 很多问题直到真实跑起来才暴露
- 单测通过并不代表扩展在真实页面中可用

根因：
- 过早相信本地推演和静态阅读
- 把“能 build / 能 test”误当成“能跑通”

当前处理原则：
- 每轮涉及主链路的改动后，至少补一轮真机闭环验证
- `build/test` 只能算基础门槛，不能当成最终验收
- 验收状态统一落在 [`acceptance.md`](/D:/code/browser-agent-mvp/doc/acceptance.md)

仍需关注：
- 当前项目仍未完成完整的 Chrome 真机闭环回归

---

### 2.2 旧设计把 LLM 拉进了过细的 DOM 执行细节

来源：
- `3c0d068` `设计思路准备重构，旧设计无效，旧线程丢弃`
- `f329b84` `完成新范式的重构`
- [`thread_bootstrap.md`](/D:/code/browser-agent-mvp/doc/thread_bootstrap.md)
- [`spec.md`](/D:/code/browser-agent-mvp/doc/spec.md)

现象：
- LLM 被要求决定大量细粒度 DOM 动作
- 一旦页面结构或状态稍有变化，主链就开始漂移
- 讨论和实现都容易陷入“修一个 selector、补一个 wait、再加一个判断”的局部泥潭

根因：
- 把 agent 理解成“LLM 决定每一个页面动作”
- 没有把等待、重试、提取、fallback 这类脏活沉到 tool 内部

当前处理原则：
- 核心定义固定为 `Agent = LLM + Tools + Memory + Runtime`
- LLM 负责规划、调度、结果总结
- Tools 封装等待、提取、重试、过滤、fallback
- Runtime 负责循环、状态、校验、容错

仍需关注：
- 当前代码已经转向 tool-first，但还没有完全达到“高阶 tool 调度优先”的目标

---

### 2.3 文档最初把设计、现状、验收混写在一起

来源：
- `f340558` `demo重构，引入文档系统`
- `3c0d068` 之后的线程重启和历史归档
- [`AGENTS.md`](/D:/code/browser-agent-mvp/AGENTS.md)

现象：
- 需求、实现、验收、线程上下文混在一份文档里
- 发现问题时，很难判断应该改设计、改代码现状，还是改验收口径
- 旧思路容易在后续讨论中持续污染新设计

根因：
- 缺少 source of truth 分层
- 没有历史归档机制

当前处理原则：
- 设计真相放 [`spec.md`](/D:/code/browser-agent-mvp/doc/spec.md)
- 代码现状放 [`status.md`](/D:/code/browser-agent-mvp/doc/status.md)
- 验收口径放 [`acceptance.md`](/D:/code/browser-agent-mvp/doc/acceptance.md)
- 新线程上下文放 [`thread_bootstrap.md`](/D:/code/browser-agent-mvp/doc/thread_bootstrap.md)
- 发生范式切换时，先归档到 [`history/`](/D:/code/browser-agent-mvp/doc/history/2026-04-01-thread-reset/README.md)

仍需关注：
- 后续如果设计再次发生明显切换，必须继续先归档再重写，避免新旧文档混写

---

### 2.4 搜索 query 过度依赖大模型或过度拆规则，都会把搜索带偏

来源：
- 最近几轮设计复盘
- [`spec.md`](/D:/code/browser-agent-mvp/doc/spec.md)
- [`status.md`](/D:/code/browser-agent-mvp/doc/status.md)

现象：
- 用户要找“3000 元左右的笔记本电脑”，结果可能被带到 `MacBook`
- 过度规则化拆 query 时，又容易把自然意图切碎，生成不自然的站内搜索词

根因：
- 让主模型自由发挥搜索词，会被训练偏好和热门商品带偏
- 先把用户目标拆成一堆字段，再硬拼 query，也可能破坏原始意图

当前处理原则：
- 搜索阶段只关心高质量 `searchQuery`
- 优先使用专门的 query compiler 或小模型生成搜索词
- 不让主模型在主链里自由决定搜索词

仍需关注：
- 小模型生成搜索词的稳定性仍需持续观察
- 不同类目、模糊需求、品牌词仍可能出现偏移

---

### 2.5 把扫描、页面就绪判断、结构化提取耦合在一起，会让问题难以定位

来源：
- `2d17f7a` `Fix tools-only result extraction flow`
- `6adbd27` `Relax search-page readiness for extractable results`
- `a2effdd` `Fix current JD search page extraction compatibility`
- [`status.md`](/D:/code/browser-agent-mvp/doc/status.md)

现象：
- 页面已经有可提取商品，但状态流还认为“未就绪”
- 提取失败时，分不清是页面没准备好、选择器失效，还是工具链路错了
- 修一个问题时，经常同时动到 scanner、extractor、runtime

根因：
- 页面事实识别和业务提取没有分层
- “是否 ready” 与 “能否提取” 被绑死在一起

当前处理原则：
- 页面扫描只负责环境事实
- 结构化提取作为独立 tool
- ready 判断只服务于“是否足够可用”，不再追求“完全 ready”

仍需关注：
- 代码里站点逻辑仍散落在多个模块中，site adapter 还没有正式抽出来

---

### 2.6 “等待页面完全就绪”是错误目标

来源：
- `6adbd27` `Relax search-page readiness for extractable results`
- [`spec.md`](/D:/code/browser-agent-mvp/doc/spec.md)

现象：
- 动态页面可能长时间持续变化，根本不会进入理想化的“完全 ready”
- 如果一直等待，会带来无意义的停顿、重扫和上下文噪音

根因：
- 用传统爬虫或静态页面思路理解浏览器 Agent
- 误把“页面完全稳定”当成执行前提

当前处理原则：
- 等待策略下沉到 tool 内部
- 采用短等待 + 一次短重试 + 快速失败
- 目标是“足够可用”，不是“完全 ready”

仍需关注：
- 不同页面类型对“足够可用”的阈值还需要继续通过真机日志校准

---

### 2.7 京东真实页面对选择器和提取策略的稳定性要求远高于静态推演

来源：
- `a2effdd` `Fix current JD search page extraction compatibility`
- `b79fabc` `Refine JD search flow and add project README`
- [`status.md`](/D:/code/browser-agent-mvp/doc/status.md)

现象：
- 旧的 card selector 可能突然失效
- 页面上明明有商品链接，但原始提取路径抓不到
- 真机中往往要靠 fallback heuristic 才能继续闭环

根因：
- 真实页面结构与最初假设不一致
- 单一 selector 策略过脆

当前处理原则：
- 保留主 selector 路径
- 同时保留 link-based fallback heuristic
- 输出 diagnostics，便于回归和微调

仍需关注：
- 这类问题本质上不会一次性消失，只能通过回归日志持续修正

---

### 2.8 前端一旦承担过多业务假设，就会反过来干扰主链调试

来源：
- 近期 Side Panel 调试问题
- [`status.md`](/D:/code/browser-agent-mvp/doc/status.md)

现象：
- 由于字段改成可选或输出改成 Markdown，前端渲染容易先崩
- UI 崩掉后，表面上像是 runtime 卡住，实际是 Side Panel 自己挂了

根因：
- 前端承担了过多业务字段假设
- 把展示层与业务状态强绑定

当前处理原则：
- 前端优先做通用展示
- 结果展示优先支持 Markdown 或通用结果块
- 可选字段统一做安全兜底

仍需关注：
- 当前 Markdown 渲染仍是轻量实现，复杂格式支持有限

---

### 2.9 “重构一次”并不会自动带来真闭环，线程重启只解决方向，不解决细节

来源：
- `f329b84` `完成新范式的重构，细节问题仍然有错误待修复`
- [`status.md`](/D:/code/browser-agent-mvp/doc/status.md)

现象：
- 线程重启后设计更清晰了，但真实页面问题、细节兼容问题、provider 验证问题仍然存在
- 容易高估“范式切换”的即时收益

根因：
- 设计修正解决的是主线方向
- 真实工程问题仍然需要逐项打通

当前处理原则：
- 新设计先解决职责边界和主循环问题
- 具体稳定性问题继续通过真机回归逐项修
- 不把“文档重写”误当成“工程问题已解决”

仍需关注：
- 目前最大的未闭环问题仍然是真机稳定性，而不是概念定义

---

## 3. 当前仍在持续观察的风险

### 3.1 小模型搜索词质量

需要继续关注：
- 不同品类是否稳定
- 模糊意图是否被过度收缩
- 品牌词是否被误改

---

### 3.2 site adapter 仍未正式抽象

需要继续关注：
- 当前仍偏京东单站
- 多站点扩展时，站点逻辑是否能顺利收口成 adapter

---

### 3.3 真机验收仍然不足

需要继续关注：
- Chrome 扩展完整加载闭环
- 京东真实搜索页更多 query 的回归
- Gemini / DeepSeek provider 的真实请求验证

---

## 4. 后续记录规则

后续新增踩坑记录时，建议统一包含以下四项：

1. 现象
2. 根因
3. 当前处理原则
4. 仍需关注

如能定位到明确来源，额外补充：

- 对应 commit
- 对应文档
- 对应模块

Updated: 2026-04-02
