# Browser Agent MVP 当前状态

## 1. 文档定位

本文档描述当前代码实现现状，不描述理想目标。

如果本文件与 `spec.md` 不一致，表示当前实现存在偏差，需显式记录。

---

## 2. 当前实现概览

当前代码已经具备以下基础能力：

- Chrome Extension MV3 工程可构建
- Side Panel 可启动 session
- Background runtime 可驱动主循环
- Content script 可扫描页面与执行动作
- LLM client 已接入 Gemini
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
- 主循环 `scan -> plan -> decide -> execute -> observe`
- debug logs
- 基础错误处理
- action / llm retry
- 页面跳转到京东首页的启动兜底

### 3.2 Memory

已实现：

- goal
- plan
- step history
- logs
- page snapshot
- extracted items
- next intent
- error
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
- 搜索结果商品提取
- fallback heuristic 提取

### 3.5 UI

已实现：

- Side Panel 输入与控制按钮
- 状态展示
- 最新步骤摘要
- 最新动作与结果
- 最终结果表格
- 错误提示

---

## 4. 当前偏差

以下内容与 `spec.md` 或当前设计方向存在偏差：

### 4.1 Provider 偏差

- 规范目标：支持 `Gemini Flash / DeepSeek`
- 当前实现：只接入 Gemini

### 4.2 时间线偏差

- 规范方向：应能清楚展示完整过程
- 当前实现：只暴露最新一步和日志，不是完整 step timeline

### 4.3 提取职责偏差

- 规范方向：结构化提取应该逐步独立成 tool
- 当前实现：扫描器本身已经在做较重的商品提取

### 4.4 LLM 介入范围偏差

- 规范方向：LLM 应尽量后置，只处理高价值语义任务
- 当前实现：仍采用 `scan -> llm -> act -> observe` 的主链，LLM 介入频率偏高

### 4.5 搜索词偏差

- 规范方向：搜索词应优先规则生成或由小模型做轻量补全
- 当前实现：搜索意图更容易被主模型上下文带偏，存在搜错词风险

### 4.6 恢复逻辑偏差

- 规范方向：观察失败后 runtime 应明确决定重试、等待或终止
- 当前实现：已经有 `expectedOutcome` 比对，但仍偏向“记错后继续跑”

### 4.7 页面等待策略偏差

- 规范方向：短等待、快速失败，不追求页面完全 ready
- 当前实现：还没有形成明确的“1s 左右短等待 + 一次短重试”的统一策略

### 4.8 入口层偏差

- 规范方向：后续应支持统一搜索入口层
- 当前实现：当前启动流程仍以京东页为主要路径

### 4.9 结果渲染偏差

- 规范方向：最终结果应逐步转为 Markdown 或通用结果块渲染
- 当前实现：Side Panel 仍偏固定表格字段渲染

---

## 5. 当前最可能的瓶颈

根据代码现状，当前核心瓶颈主要在：

1. 页面 ready 判定不足
2. 搜索结果 DOM 提取不稳定
3. 扫描器与提取器职责耦合
4. 主 LLM 介入过早，容易被页面噪音污染
5. 观察失败后的恢复策略不足

---

## 6. 已验证结果

已验证：

- `npm test` 通过
- `npm run build` 通过
- `dist/` 产物可生成

未验证：

- 真机 Chrome 中完整业务闭环稳定跑通
- 多次重试下商品提取稳定性
- 多 provider 切换能力

---

## 7. 下一步建议

建议按以下顺序推进：

1. 增加规则化 query compiler，先把搜索词生成从主 LLM 中拿出去
2. 增加短等待与快速失败策略
3. 将结构化提取从扫描器中进一步抽离
4. 把观察失败转成明确 runtime 分支
5. 补 provider 抽象，接入 DeepSeek
6. 再考虑搜索入口层泛化

Updated: 2026-04-01
