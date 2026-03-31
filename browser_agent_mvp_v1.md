# 浏览器 Agent MVP v1 需求文档

> 定位：本文档用于指导第一版 Browser Agent MVP 开发。
>
> 本版目标不是对外产品化，而是内部可演示、可跑通、可定位问题的最小版本。
>
> 核心定义：`Agent = LLM（决策） + Memory（上下文） + Tools（能力） + Runtime（调度与控制）`

---

## 1. MVP 目标

### 1.1 一句话目标

让团队成员在 Chrome 中亲眼看到一个 Agent 在京东完成一次从搜索到推荐的最小闭环，并能清楚看到它每一步做了什么、为什么停下、哪里失败。

### 1.2 本版定位

- 仅供内部演示和开发验证
- 重点是跑通单场景闭环，不追求泛化能力
- 重点是把系统结构搭起来，后续优化能明确落到具体层

### 1.3 固定演示脚本

前置条件：

- 用户已打开京东首页 `https://www.jd.com`
- 浏览器已安装扩展
- 本地已配置可用模型 API Key

演示脚本：

1. 用户打开 Side Panel
2. 输入：`帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐`
3. Agent 自动定位搜索框并输入搜索词
4. Agent 自动触发搜索并进入搜索结果页
5. Agent 提取商品列表信息
6. Agent 输出结构化对比结果和推荐理由
7. Side Panel 展示过程和最终结果

### 1.4 成功标准

| 编号 | 标准 | 验证方式 |
|---|---|---|
| S1 | 扩展可安装并打开 Side Panel | 手动安装后验证 |
| S2 | 从京东首页出发，可自动完成搜索 -> 提取 -> 推荐闭环 | 全程录屏 |
| S3 | 页面可见高亮框和幽灵光标等视觉反馈 | 全程录屏 |
| S4 | Side Panel 可实时展示状态、步骤摘要、动作结果 | 全程录屏 |
| S5 | 最终输出至少 3 个商品的结构化对比表 | 截图验证 |
| S6 | 失败时不崩溃，能显示错误并允许重新开始 | 人工验证 |

说明：

- 本版不要求对所有京东页面稳定工作，只要求对固定测试链路跑通
- 时间目标建议控制在 60 秒内，不将其作为唯一阻塞验收项

---

## 2. 范围边界

### 2.1 必须做

- Chrome Extension MV3 插件形态
- Side Panel 作为主交互入口
- 仅支持京东首页和京东搜索结果页
- 支持一次单标签页单任务会话
- 真实 LLM API 接入
- 页面扫描、动作执行、视觉反馈跑通
- Side Panel 展示步骤摘要、状态和最终结果
- 基础错误处理、超时、重试和停止能力

### 2.2 明确不做

- 多站点适配
- 第二业务场景
- 登录、支付、验证码
- 多标签页协同
- 会话持久化和断点续跑
- 多 Agent 分工模型
- 视觉模型识图
- 复杂安全体系
- 复杂拟人轨迹

### 2.3 本版技术边界

- LLM 先使用单模型跑通，不拆成 planner / executor / verifier 三个模型角色
- Memory 仅做 session memory，不做长期记忆
- Runtime 负责硬约束，LLM 不直接拥有执行权

---

## 3. Agent 总定义

本项目中的 Agent 由以下四部分组成：

| 组成 | 定义 | 本版职责 | 不负责 |
|---|---|---|---|
| LLM | 决策器 | 根据 memory 输出下一步动作和最终总结 | 直接操作 DOM、直接改状态机 |
| Memory | 上下文容器 | 保存目标、计划、历史、页面快照、提取结果、错误信息 | 长期存储、跨会话复用 |
| Tools | 可执行能力集合 | 提供 CLICK、TYPE、SCROLL、EXTRACT_LIST、DONE | 自主决定何时执行 |
| Runtime | 控制层 | 调度任务、推进状态、控制环境、校验动作、执行工具、写回 memory | 生成业务结论 |

设计原则：

- LLM 负责“判断做什么”
- Runtime 负责“决定能不能做、什么时候做、做完如何落库”
- Tools 负责“实际执行”
- Memory 负责“给下一轮提供上下文”

---

## 4. Runtime 定义

### 4.1 Runtime 的职责

本项目中的 runtime 指：

- 任务调度
- 状态转移
- 环境控制
- 执行调度
- 校验与重试

### 4.2 Runtime 子模块

| 模块 | 职责 |
|---|---|
| Scheduler | 启动、停止、超时、中断、重试 |
| State Machine | 管理 session 状态流转 |
| Environment Controller | 管理 tab、页面类型、导航恢复、content script 可用性 |
| Tool Dispatcher | 把 action 路由到对应 tool |
| Guardrails | schema 校验、白名单校验、禁用动作校验、步数限制 |

### 4.3 状态机

```text
idle
  -> scanning      收集页面快照
  -> planning      首轮生成简短计划
  -> acting        执行动作
  -> observing     观察执行结果并更新 memory
  -> done          任务完成
  -> error         不可恢复错误
```

状态转移规则：

1. `START_SESSION` 后进入 `scanning`
2. 首轮拿到 snapshot 后进入 `planning`
3. 规划完成后进入 `acting`
4. 动作执行后进入 `observing`
5. 若任务未完成，重新进入 `scanning`
6. 达到完成条件进入 `done`
7. 达到步数上限、重试上限、超时或致命错误进入 `error`

### 4.4 Runtime 硬限制

```ts
const LIMITS = {
  MAX_STEPS: 10,
  MAX_LLM_RETRIES: 3,
  MAX_ACTION_RETRIES: 2,
  LLM_TIMEOUT_MS: 30_000,
  ACTION_TIMEOUT_MS: 10_000,
};
```

---

## 5. Memory 定义

### 5.1 Memory 的定义

Memory 是当前 session 的全部上下文，不是长期记忆。

它至少包括：

- 用户目标是什么
- 当前计划是什么
- 已经执行了哪些步骤
- 工具执行是否成功
- 当前页面是什么
- 当前页面有哪些可操作元素
- 已经提取到了哪些商品信息
- 当前下一步应该朝哪个方向推进
- 当前处于什么运行状态

### 5.2 Session Memory 结构

```ts
interface SessionMemory {
  goal: string;
  plan: string[];
  stepHistory: StepRecord[];
  pageSnapshot?: SnapshotData;
  extractedItems: ExtractedItem[];
  nextIntent?: string;
  lastError?: string;
  runtimeMeta: {
    sessionId: string;
    tabId: number;
    pageType: "home" | "search" | "detail" | "unknown";
    status: "idle" | "scanning" | "planning" | "acting" | "observing" | "done" | "error";
    currentStep: number;
    llmRetryCount: number;
    actionRetryCount: number;
  };
}
```

### 5.3 Memory 更新原则

- Runtime 维护 memory 主版本
- LLM 只读取 memory，并给出下一步建议
- 工具执行结果必须结构化回写到 memory
- 只保留最近必要历史，避免上下文膨胀
- 本版不落 `chrome.storage.local`

---

## 6. Tools 定义

### 6.1 Tool 白名单

本版只允许以下工具：

```ts
type AgentAction =
  | { type: "CLICK"; agentId: string }
  | { type: "TYPE"; agentId: string; text: string; submit?: boolean }
  | { type: "SCROLL"; direction: "up" | "down"; amount?: number }
  | { type: "EXTRACT_LIST" }
  | { type: "DONE"; summary: string; items?: ExtractedItem[] };
```

### 6.2 Tool 定义表

| Tool | 作用 | 输入 | 输出 | 失败条件 |
|---|---|---|---|---|
| CLICK | 点击目标元素 | `agentId` | `success / error` | 元素不存在、不可见、已失效 |
| TYPE | 输入文本 | `agentId + text + submit` | `success / error` | 输入框失效、事件未触发 |
| SCROLL | 滚动页面 | `direction + amount` | `success / error` | 页面无滚动变化 |
| EXTRACT_LIST | 提取商品列表 | 无 | 结构化商品数组 | 选择器失效、数据缺失 |
| DONE | 结束任务 | `summary + items` | 最终结果 | 输出结构不完整 |

### 6.3 Tool 调用原则

- 只能调用白名单 tool
- `CLICK` 和 `TYPE` 必须校验 `agentId`
- 禁止对购买、加入购物车、支付、提交订单等敏感目标执行动作
- `EXTRACT_LIST` 不依赖 LLM 自由提取，优先走固定扫描器

---

## 7. LLM 定义

### 7.1 LLM 的职责

本版中 LLM 的职责只有两个：

1. 基于 memory 决定下一步动作
2. 在任务结束时输出简短总结和推荐理由

LLM 不负责：

- 直接执行动作
- 修改 runtime 状态
- 绕过工具校验
- 直接操作 DOM

### 7.2 Provider 策略

- 本版 Provider 先支持 `Gemini Flash` 和 `DeepSeek`
- 通过统一 `llm-client` 接口接入，不把业务逻辑写死在某一家模型 SDK 中
- API Key 采用本地开发配置方式

说明：

- 由于本版是纯前端内部演示方案，不解决正式密钥托管问题
- 该风险已知，但在本版可接受

### 7.3 LLM 输出协议

```json
{
  "stepSummary": "当前阶段要做什么",
  "nextIntent": "下一步的意图",
  "expectedOutcome": "执行后预期会发生什么变化",
  "action": {
    "type": "TYPE",
    "agentId": "el_search_input",
    "text": "5000元 笔记本电脑",
    "submit": false
  },
  "done": false
}
```

字段要求：

- `stepSummary`：给 Side Panel 展示的步骤摘要，不展示原始推理链
- `nextIntent`：给 runtime 写入 memory，便于下一轮上下文压缩
- `expectedOutcome`：用于执行后和真实环境结果做比对
- `action`：唯一可执行动作
- `done`：表示是否完成任务

### 7.4 首版是否拆成规划 / 执行 / 校验

本版结论：

- 不拆成三个模型角色
- 采用“单 LLM 决策 + Runtime 校验 + Tool 执行”模式

原因：

- 当前目标是先跑通
- 当前主要风险在 DOM、工具、状态流转和上下文组织，不在多模型分工
- 先把 runtime 和 memory 结构搭正，后续再决定是否拆角色

### 7.5 校验原则

LLM 输出后，必须经过 runtime 的确定性校验：

- JSON 结构合法
- action.type 在白名单内
- 需要 `agentId` 的动作必须校验存在性
- 敏感动作必须被拦截
- 达到完成条件前不得随意 `DONE`

---

## 8. 执行校验与反幻觉机制

### 8.1 设计原则

模型幻觉不能只靠模型自我纠正，必须通过 runtime、tools 和环境观察进行外部校验。

本版采用三层碰撞机制：

- 规则碰撞：用 schema、白名单、状态机、终止条件约束模型输出
- 环境碰撞：用真实页面状态、URL、DOM、输入值、提取结果校验动作是否真的生效
- 历史碰撞：用最近执行历史检测重复动作、无效动作、死循环

### 8.2 执行前校验

在任何 action 执行前，runtime 必须完成以下检查：

1. JSON 是否可解析
2. 动作结构是否完整
3. `action.type` 是否在白名单
4. 若为 `CLICK` / `TYPE`，`agentId` 是否存在于当前 snapshot
5. 当前页面类型是否允许该动作
6. 是否命中敏感动作拦截规则
7. 是否与最近失败动作完全重复且无新证据

说明：

- 本版不允许批量动作，一轮只能执行一个 action
- 若校验不通过，不进入 tool 执行，直接记为失败并回写 memory

### 8.3 执行时要求

LLM 输出的不是“自由文本建议”，而是可执行动作。

每个动作在执行时必须满足：

- 有明确目标
- 有可观测结果
- 有失败信号

Tool 不允许只返回 `success: true`，必须尽量返回结构化观测结果。例如：

- `CLICK`：点击的元素标识、元素文本、是否发生导航
- `TYPE`：输入前值、输入后值、是否触发输入事件
- `SCROLL`：滚动前后位置
- `EXTRACT_LIST`：提取数量、字段缺失情况

### 8.4 执行后观察

每次动作执行后，runtime 必须重新观察环境，而不是直接相信动作已经成功。

执行后至少做以下观察：

1. 重新扫描页面，获取新的 snapshot
2. 判断页面类型是否变化
3. 判断 URL 是否变化
4. 判断目标元素状态是否变化
5. 判断工具返回结果是否与页面观察一致

示例：

- `TYPE` 后要确认输入框值确实变化
- `CLICK` 后要确认页面跳转、DOM 更新或交互状态变化
- `EXTRACT_LIST` 后要确认实际提取到足够数量的商品

### 8.5 预期结果对比

LLM 每轮除 action 外，还应提供一个简短的 `expectedOutcome`，用于执行后比对。

示例：

```json
{
  "stepSummary": "输入搜索词",
  "nextIntent": "进入搜索结果页",
  "expectedOutcome": "搜索框内容更新，并准备触发搜索",
  "action": {
    "type": "TYPE",
    "agentId": "el_search_input",
    "text": "5000元 笔记本电脑"
  },
  "done": false
}
```

runtime 需要比对：

- 预期结果是否发生
- 发生的结果是否足以支持继续下一步

若不符合：

- 不直接进入下一步
- 将失败证据写入 memory
- 交由下一轮修正或触发重试

### 8.6 终止条件硬约束

本版中 `DONE` 不能只靠模型主观判断，至少要满足：

- 当前处于允许结束的页面阶段
- 已提取到至少 3 个商品
- 商品关键信息具备基本完整性
- 最终结果结构合法

若条件不满足，即使 LLM 输出 `DONE`，runtime 也必须拒绝。

### 8.7 重复动作与死循环检测

runtime 需要检查最近几步历史，避免以下情况：

- 连续重复点击同一元素
- 连续重复输入相同内容
- 在无新页面变化的情况下重复滚动
- 多轮停留在相同页面状态但没有新增事实

若命中以上模式：

- 优先判定为无效循环
- 记录到 memory
- 超过阈值后终止 session 并提示错误

### 8.8 首版结论

本版不引入独立 verifier 模型。

本版采用：

- 单 LLM 决策
- Runtime 硬校验
- Tool 结构化返回
- 执行后重新观察环境

这样做的目的不是彻底消灭幻觉，而是让幻觉尽可能暴露在可调试的系统边界上。

---

## 9. 单轮执行循环

每一轮循环按以下顺序执行：

1. Runtime 请求页面快照
2. Content Script 扫描当前页面并返回 `SnapshotData`
3. Runtime 将目标、计划、最近历史、页面快照组装成 memory context
4. Runtime 调用 LLM 获取下一步 action 和 `expectedOutcome`
5. Runtime 校验 action
6. Tool Dispatcher 执行动作
7. Content Script 返回执行结果
8. Runtime 重新扫描页面并观察外部结果
9. Runtime 比对 `expectedOutcome` 和实际观察结果
10. Runtime 更新 memory
11. Side Panel 刷新步骤摘要和状态
12. 若未完成则进入下一轮

首轮特殊处理：

- 第一次扫描后，先要求 LLM 输出一个简短计划
- 计划只需 2 到 4 步，不追求复杂推理

---

## 10. 页面环境与 DOM 扫描

### 9.1 支持页面

- 京东首页：搜索入口
- 京东搜索结果页：商品列表提取

### 9.2 页面类型识别

```ts
type PageType = "home" | "search" | "detail" | "unknown";
```

本版只要求稳定识别：

- `home`
- `search`

`detail` 可保留枚举，但不是必须路径。

### 9.3 扫描输出

Content Script 需要输出：

- 当前 URL
- 页面标题
- 页面类型
- 可交互元素列表
- 商品列表摘要
- 可用于后续定位的 `agentId`

### 9.4 商品提取原则

- 京东搜索结果页使用硬编码选择器
- 最多提取前 10 个候选商品
- 最终结果至少保留 3 个可比较商品
- 选择器统一集中管理，方便后续替换

### 9.5 导航恢复

页面跳转后，runtime 需要负责：

- 感知 tab 导航完成
- 确认 content script 可继续工作
- 重新请求 snapshot
- 继续 loop

---

## 11. UI 与演示层

### 10.1 Side Panel 必须展示的信息

- 当前状态
- 当前步骤摘要
- 当前动作
- 动作结果
- 最终对比结果
- 错误信息

说明：

- 本版展示的是“步骤摘要”，不是模型原始 thought chain
- 这样更稳定，也更利于产品化迁移

### 10.2 页面视觉反馈

必须包含：

- 高亮框
- 幽灵光标

目标：

- 让演示者看得见 Agent 在操作哪里
- 让失败时能快速判断卡在扫描、决策还是执行

### 10.3 UI 技术要求

- Side Panel 默认推荐 `HTML + TypeScript + CSS`
- React 不是本版必需项
- 若团队已有 React 开发习惯，可使用 React，但不应因此引入额外架构复杂度

结论：

- `TypeScript` 是推荐项
- `React` 是可选项，不是需求本身

---

## 12. 技术建议

### 11.1 推荐技术栈

| 层 | 选型建议 |
|---|---|
| 插件形态 | Chrome Extension MV3 |
| 语言 | TypeScript |
| Side Panel | HTML + TypeScript + CSS，React 可选 |
| 后台编排 | Service Worker |
| 页面执行 | Content Script |
| 通信 | `chrome.runtime.sendMessage` |
| LLM Provider | Gemini Flash / DeepSeek |

### 11.2 目录建议

```text
browser-agent-mvp/
├── public/
│   ├── manifest.json
│   ├── icons/
│   └── sidepanel.html
├── src/
│   ├── sidepanel/
│   ├── background/
│   ├── content/
│   └── shared/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

目录原则：

- `background` 放 runtime、scheduler、llm-client
- `content` 放扫描器、动作执行器、overlay
- `shared` 放协议、类型、常量
- `sidepanel` 只放 UI，不放核心决策逻辑

---

## 13. 验收与开发阶段

### 12.1 阶段划分

| 阶段 | 交付物 | 验证点 |
|---|---|---|
| P1 骨架 | MV3 工程、Side Panel、基础通信 | Side Panel -> Service Worker -> Content Script 消息链跑通 |
| P2 扫描 | 京东首页和搜索页扫描器 | 可输出结构化 snapshot |
| P3 Runtime | session memory、状态机、调度循环 | 单轮扫描 -> 决策 -> 校验 -> 执行 -> 回写跑通 |
| P4 Tools | CLICK / TYPE / SCROLL / EXTRACT_LIST | 可对固定元素稳定执行 |
| P5 LLM | Gemini / DeepSeek 接入 | 能返回合法 action JSON |
| P6 闭环 | 单场景全流程 | 京东首页到结果输出跑通 |
| P7 演示层 | 高亮框、幽灵光标、结果面板 | 可录屏演示 |

### 12.2 阶段门禁

- 每一阶段必须有明确验证点
- 未通过验证点不得继续叠加复杂度
- 出问题时先定位属于哪一层：LLM / Memory / Tools / Runtime

---

## 14. 已知风险

| 风险 | 影响 | 当前策略 |
|---|---|---|
| 京东 DOM 变化 | 提取失败 | 选择器集中管理，固定测试页面 |
| LLM 输出不稳定 | 动作非法、提前 DONE | schema 校验 + 重试 |
| TYPE 不生效 | 无法搜索 | 完整输入事件链，必要时补提交动作 |
| 页面跳转后脚本丢失 | loop 中断 | 监听导航完成后恢复扫描 |
| API Key 暴露 | 不适合正式产品 | 当前仅内部演示接受 |
| Service Worker 生命周期问题 | 会话中断 | 当前不做持久化，失败后允许重试 |

---

## 15. 后续演进方向

以下不在本版范围内，但后续可以演进：

1. planner / executor / verifier 多角色拆分
2. session memory 持久化
3. 通用 DOM 剪枝
4. 多站点模板
5. 更严格的动作安全拦截
6. 视觉模型兜底
7. 人工接管和暂停恢复

---

Updated: 2026-03-31
