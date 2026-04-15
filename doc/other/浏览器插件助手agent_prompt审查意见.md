# 浏览器插件助手 Agent Prompt 审查意见

## 一、总体结论

当前这套 Prompt 体系**方向正确、已经可用**，明显具备工程化意识：
- 已完成按节点拆分，而不是单一总 Prompt 包打天下
- 关键节点采用 JSON-only 输出，具备结构化约束意识
- 已覆盖 route / query rewrite / candidate reorder / final result 等核心链路
- 已开始处理 freshness、official、search preference 等现实约束

但从“可用”到“稳定产品级”，还差一层：**现在的主要问题不是文案不够好，而是协议不够硬、失败态不够完整、分类维度不够正交。**

一句话判断：

> 这不是一套坏 Prompt，而是一套还停留在“提示词工程”阶段、尚未完全升级为“状态机协议工程”的 Prompt。

---

## 二、核心问题

### 1. TaskType 维度混杂，边界容易漂移

当前 `taskType`：
- `direct_answer`
- `commerce_search`
- `public_research`
- `site_overview`

问题在于，这里面混合了三种不同维度：
- 任务目标：问答 / 研究 / 购物
- 信息来源：公网 / 单站点 / 官网
- 执行方式：是否需要浏览、是否限制在单站点内

这会导致边界样本容易漂移，例如：
- “总结某官网 pricing page”
- “看看某产品官网功能与价格”
- “对比两个官网定位”

此时 `site_overview` 与 `public_research` 并不真正同层，模型容易概率折中。

**建议：**
将路由拆成两层：
1. 是否需要浏览：`needBrowse: true/false`
2. 浏览模式：`browseMode: public_research | site_overview | commerce_search`

这样比强行四选一更稳。

---

### 2. 缺少失败态与“不确定态”设计

目前多个节点默认模型必须给出一个正向答案，例如：
- candidate reorder 必须排序
- next tool 必须选一个工具
- final result 默认要产出结论

这会诱发**伪完成**：候选都差、证据不足、当前不该继续，也会被迫给出“看起来完成”的结果。

**建议：**
所有关键节点都增加显式失败态：
- `needs_new_search`
- `replan`
- `insufficient_evidence`
- `stop_and_answer`
- `abstain`

原则：

> 不要让模型在没有合适动作时，被迫硬选一个动作。

---

### 3. `reason` 太偏解释性，缺少机器可用字段

当前很多 schema 形如：

```json
{"taskType":"...","reason":"..."}
```

这对人类可读，但对系统调度帮助有限。相比之下，更高杠杆的是：
- `confidence`
- `decisionSignals`
- `needsFreshness`
- `needsSources`
- `targetDomain`

**建议：**
将自由文本理由，尽量替换为可被程序消费的显式状态字段。

示例：

```json
{
  "taskType": "public_research",
  "confidence": 0.84,
  "decisionSignals": ["needs_current_info", "needs_sources"],
  "targetDomain": null
}
```

---

### 4. Rules 过多，优先级不够清晰

目前 route prompt 中规则较多，且粒度不统一：
- 有任务定义
- 有例外情况
- 有风格要求
- 有边界补丁

对于 DeepSeek / Gemini Flash，这种写法容易出现：
- 记住局部规则
- 漏掉优先级
- 在边界样本上概率折中

**建议：**
把长规则列表改成**判定树**，而不是继续堆规则。

推荐顺序：
1. 最近对话是否已足够回答？
2. 是否有明确购买意图？
3. 是否给了 URL 或明确要求检查官网？
4. 是否需要最新事实 / 来源 / 验证？
5. 否则 direct answer

---

### 5. Final Result 更像写作 Prompt，而不是证据约束协议

当前 final result prompt 对写作风格要求较好，但对证据边界约束还不够硬。

风险是：模型会写出一份**很像有依据**的综合结论，但实际证据不足。

**建议补充硬约束：**
- 只能陈述来自 `sources/items/taskSpec` 的信息
- 证据不足时必须明确标注
- 来源冲突时必须呈现冲突，不能擅自统一
- 推断必须与事实陈述分开

更稳的方式是两阶段：
1. 先产出 evidence claims JSON
2. 再转为 Markdown

---

## 三、优先级最高的修改建议

## P0：先改 Schema，不先改文案

### 1. Route 节点增加置信度与决策信号

```json
{
  "taskType": "public_research",
  "confidence": 0.84,
  "decisionSignals": ["needs_current_info", "needs_sources"],
  "targetDomain": null
}
```

### 2. Next Tool 节点允许“不调用工具”

```json
{
  "action": "call_tool | stop_and_answer | replan",
  "toolName": "...",
  "reason": "..."
}
```

### 3. Candidate Reorder 节点允许“候选太差，需要重搜”

```json
{
  "action": "reorder | new_search",
  "orderedIndexes": [1, 0, 2],
  "quality": "low"
}
```

### 4. Final Result 节点显式允许“证据不足”

```json
{
  "answerStatus": "answered | partial | insufficient_evidence",
  "summary": "...",
  "markdown": "..."
}
```

---

## P1：将 `site_overview` 从一级类别降为 browseMode

因为它本质上更像“浏览范围约束”，不是和 `public_research` 同层的任务目标。

---

## P1：把 Query Rewrite 拆成两步

先做 search-intent parse：
- 核心主题
- 实体
- 限制条件
- 时间范围
- 比较维度

再做 query rewrite。

否则当前很多 rewrite 只是把原句压缩，不是真正做“研究入口优化”。

---

## P2：程序先补元数据，不把低阶判断丢给模型

对候选项建议程序先补：
- `sourceType`
- `officialDomainMatch`
- `recencyDays`
- `maybeAggregator`
- `maybeForum`

再交给模型做排序。

原则：

> 能由程序补的确定性，不要丢给 LLM 用概率猜。

---

## 四、针对当前底模的特别建议（DeepSeek / Gemini 3 Flash）

这类模型更适合：
- 分类
- 提取
- 轻量改写
- 局部排序

不太适合承担：
- 长规则下的复杂边界裁决
- 高不确定场景下的综合拍板
- 证据不足时的稳健克制表达

因此优化方向应是：
1. **减少规则长度**
2. **增强结构化字段**
3. **允许 abstain / replan / insufficient**
4. **让程序预处理更多确定性信息**
5. **降低 prose reason 比重，提高 machine-usable state 比重**

---

## 五、最终判断

### 保留
- 按节点拆 Prompt 的总体架构
- JSON-only 输出约束
- route / rewrite / reorder / final 的阶段拆分
- direct answer 与 browse 类任务的区分意识

### 必改
- taskType 维度重构
- 失败态与不确定态补全
- 从 `reason` 转向显式状态字段
- 用判定树替代长规则列表
- final result 增加证据边界约束

### 一句话建议

> 下一步不要继续做“提示词加法”，而要转向“协议设计、状态设计、失败态设计”的系统升级。

这样这套浏览器插件助手 Prompt，才会从“可用”真正迈向“稳定、低漂移、可维护”。
