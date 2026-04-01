# Browser Agent 新设计规范

## 1. 文档定位

本文档用于服务“新线程重建设计”。

它不是对旧实现的补丁说明，而是新的设计基线。

核心目标：

- 重新收敛 agent 主线
- 避免 LLM 迷失在细节
- 让 runtime、tools、memory、LLM 的边界重新清晰

---

## 2. 核心定义

唯一核心定义：

`Agent = LLM + Tools + Memory + Runtime`

其中：

- `LLM`
  - 负责规划、调度、选择高阶 tools、生成最终结果
- `Tools`
  - 封装等待、重试、提取、规则判断、局部恢复等脏活
- `Memory`
  - 保存高价值结构化上下文
- `Runtime`
  - 负责循环、状态机、执行、校验、容错

这四者缺一不可，但它们必须各司其职。

---

## 3. 设计原则

### 3.1 高阶 tool 优先

不要让 LLM 直接调度大量细粒度 DOM 动作。

优先设计：

- 任务级 tool
- 站点级 tool
- 能力块级 tool

而不是：

- 点击一个按钮
- 输入一个字符
- 等 500ms
- 再扫描一次

### 3.2 LLM 注意力稀缺

LLM 的注意力昂贵，不应被低价值页面噪音消耗。

默认不传给 LLM：

- 大量 DOM 片段
- 大量原始日志
- 细碎失败细节
- 可由代码直接得到的页面事实
- 可由代码直接提取的商品列表

### 3.3 规则不消失，而是下沉到 tool

不是要减少规则，而是要把规则从主流程中抽出来，封进 tool 内部。

例如：

- 等待策略
- 重试策略
- 关键词编译
- 价格过滤
- fallback selector

这些都更适合在 tool 内实现，而不是暴露给 LLM。

### 3.4 runtime 不做业务脏活

runtime 负责：

- 调度
- 状态转移
- 校验
- 错误处理

runtime 不应直接承载太多站点级脏逻辑。

---

## 4. LLM 规范

### 4.1 LLM 负责什么

- 目标理解
- 计划生成
- 阶段推进
- 选择调用哪个高阶 tool
- 基于结构化结果做总结和推荐

### 4.2 LLM 不负责什么

- 细粒度 DOM 操作
- 页面等待
- selector fallback
- 结构化商品提取
- 基础过滤与截断
- 局部重试策略

### 4.3 LLM 输入应尽量短

推荐输入：

- 用户目标
- 当前阶段
- 最近少量 tool 调用结果
- 已提取的结构化候选数据
- 当前失败原因

---

## 5. Tool 规范

### 5.1 Tool 是核心执行单元

tool 不是简单函数集合，而是 LLM 可调度的能力块。

每个 tool 内部可以封装：

- 规则
- 等待
- 重试
- fallback
- 提取
- 局部校验

### 5.2 Tool 粒度原则

tool 不要过细，也不要过粗。

过细的问题：

- LLM 会重新陷入细节
- 主流程会碎裂

过粗的问题：

- tool 变成黑盒
- 失败难定位

推荐粒度：

- 站内搜索
- 结果提取
- 搜索入口打开
- 搜索结果选择
- 候选结果过滤
- 最终总结生成

### 5.3 Tool 分层建议

#### 底层原子工具

仅供实现层复用，不建议直接暴露给 LLM：

- click
- type
- scroll

#### 中层组合工具

优先暴露给 LLM：

- `searchInSite`
- `extractStructuredResults`
- `openSearchEntry`
- `selectResultByDomain`
- `filterCandidates`

#### 高层任务工具

后续按场景再加：

- `findBudgetLaptops`
- `researchTopic`

### 5.4 当前推荐高阶 tools

新线程优先围绕这些 tool 设计：

- `openSearchEntry`
- `findTargetSite`
- `searchInSite`
- `extractStructuredResults`
- `filterCandidates`
- `finishWithSummary`

---

## 6. Memory 规范

memory 只保留高价值结构化上下文。

最小结构建议：

```ts
interface AgentMemory {
  goal: string;
  currentPhase: string;
  plan: string[];
  toolHistory: ToolCallRecord[];
  currentFacts: Record<string, unknown>;
  extractedItems: ExtractedItem[];
  failures: FailureRecord[];
  finalOutput?: string;
}
```

重点：

- 保存 tool 结果，而不是原始页面噪音
- 保存事实，而不是堆叠长日志
- 保存少量关键失败信息，便于恢复

---

## 7. Runtime 规范

### 7.1 Runtime 负责什么

- session 生命周期
- 状态机
- tool 调度
- tool 返回校验
- memory 更新
- 错误分支
- 停止 / 超时 / 重试

### 7.2 Runtime 最小循环

推荐最小 loop：

1. 读取 memory
2. 请求 LLM 选择下一步高阶 tool
3. 执行 tool
4. 校验 tool 结果
5. 更新 memory
6. 判断继续、重试、终止

### 7.3 Runtime 校验重点

- tool 调用是否合法
- tool 返回是否完整
- 是否达到阶段目标
- 是否进入失败分支
- 是否达到终止条件

说明：

- runtime 不替 LLM做业务规划
- runtime 不替 tool 做内部脏活

---

## 8. 搜索与提取策略

### 8.1 搜索词策略

搜索词优先由规则编译器生成。

例如：

- 用户输入：`帮我找3000元左右的笔记本电脑，对比前3个推荐`

规则编译结果：

- `category = 笔记本电脑`
- `budget = 3000`
- `topK = 3`
- `query = 笔记本电脑 3000元`

必要时才让小模型做关键词补全。

### 8.2 页面等待策略

等待逻辑封进 tool 内部，不放进 LLM 主流程。

推荐策略：

- 首次短等待：约 `1s`
- 补一次短重试：约 `0.5s`
- 仍失败则快速返回失败结果

不追求页面“完全 ready”，只追求“足够可用”。

### 8.3 结构化提取策略

提取必须由代码完成，不能由 LLM自由生成。

最小字段：

- `title`
- `price`
- `url`

可选字段：

- `shop`
- `summary`
- `tags`

### 8.4 基础过滤策略

这些默认由代码完成：

- 去重
- 预算过滤
- 结果截断
- 最小字段完整性过滤

---

## 9. UI 规范

前端职责：

- 展示状态
- 展示阶段
- 展示 tool 调用结果
- 渲染最终 Markdown 或通用结果块
- 展示必要调试信息

前端不负责：

- 业务推理
- 商品过滤
- 商品总结

---

## 10. 新线程的首要任务

1. 定义高阶 tools
2. 定义最小 memory 结构
3. 定义最小 runtime loop
4. 将当前代码映射到新主线
5. 明确哪些旧模块保留，哪些模块废弃

Updated: 2026-04-01
