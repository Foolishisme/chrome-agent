# Browser Agent MVP 当前状态

## 1. 文档定位

本文档描述当前代码实现现状，不描述理想目标。

如果本文件与 `spec.md` 不一致，表示当前实现存在偏差，需显式记录。

---

## 2. 当前实现概览

当前代码已经具备以下基础能力：

- Chrome Extension MV3 工程可构建
- Side Panel 可启动 session
- Background runtime 已改成“规则主线 + LLM 后置”
- Content script 可扫描页面、执行搜索动作并提取商品
- LLM client 已支持主模型与简单任务小模型
- 基础测试和构建通过

当前目录：

- `src/background`
- `src/content`
- `src/shared`
- `src/sidepanel`

---

## 3. 当前已实现能力

### 3.1 Runtime

已实现：

- session 初始化与停止
- 结构化 query compiler
- 规则化搜索提交
- 规则化结果提取与过滤
- 短等待与快速失败策略
- 滚动恢复分支
- 最终推荐总结生成
- debug logs 与 timeline
- 页面跳转到京东首页的启动兜底

### 3.2 Memory

已实现：

- goal
- 固定 plan
- task spec
- step history
- logs
- page snapshot
- raw extracted items
- filtered items
- filter diagnostics
- final summary
- runtime metadata

### 3.3 Tools

已实现：

- `CLICK`
- `TYPE`
- `SCROLL`
- `EXTRACT_LIST`
- `DONE`

### 3.4 页面扫描

已实现：

- 页面类型识别：`home/search/unknown`
- 搜索框、搜索按钮识别
- 页面可用性判断
- 搜索结果列表状态判断

### 3.5 结构化提取

已实现：

- 独立提取器 `extractor.ts`
- 主选择器提取
- fallback heuristic 提取
- 提取诊断输出

### 3.6 LLM

已实现：

- 主模型用于最终推荐总结
- 简单任务模型用于搜索词补全
- 简单任务模型默认值为 `gemini-3.1-flash-lite-preview`
- 简单任务模型带 fallback 链路

### 3.7 UI

已实现：

- Side Panel 输入与控制按钮
- 状态展示
- timeline 展示
- 结构化任务展示
- 过滤诊断展示
- 页面调试展示
- 最终结果表格
- 错误提示

---

## 4. 当前偏差

以下内容与 `spec.md` 或当前设计方向仍存在偏差：

### 4.1 Provider 偏差

- 规范目标：支持 `Gemini Flash / DeepSeek`
- 当前实现：只接入 Gemini；DeepSeek 仍未接入

### 4.2 结果渲染偏差

- 规范方向：最终结果应逐步转为 Markdown 或通用结果块渲染
- 当前实现：Side Panel 仍以表格 + 文本摘要为主

### 4.3 多站点偏差

- 规范方向：后续应支持统一搜索入口层
- 当前实现：仍固定在京东首页 / 搜索页链路

### 4.4 真机验证偏差

- 规范方向：闭环应以真机结果为准
- 当前实现：构建和测试通过，但还缺少本轮重构后的完整真机回归

---

## 5. 当前最可能的瓶颈

根据代码现状，当前核心瓶颈主要在：

1. 京东搜索结果 DOM 结构仍可能变化
2. 预算过滤后结果数可能不足
3. 真机页面加载时序与当前短等待策略是否匹配
4. lite 模型名称在不同环境下的可用性

---

## 6. 已验证结果

已验证：

- `npm test` 通过
- `npm run build` 通过
- `dist/` 产物可生成

未验证：

- 真机 Chrome 中完整业务闭环稳定跑通
- 多次重试下商品提取稳定性
- `gemini-3.1-flash-lite-preview` 在当前 key 权限下的真实可用性
- DeepSeek provider

---

## 7. 下一步建议

建议按以下顺序推进：

1. 做一次真机闭环回归，重点看 A7
2. 根据真机日志微调京东结果页提取规则
3. 将最终结果逐步改成 Markdown / 通用结果块渲染
4. 补多 provider 抽象和 DeepSeek 接入
5. 再考虑搜索入口层泛化

Updated: 2026-04-01
