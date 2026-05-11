# Browser Agent 验收清单

## 1. 定位

本文记录当前实际运行主链的验收目标、验证方式和状态。

当前主链：

`BrowserAgentRuntime -> runner -> RuntimeBrowserDriver -> content bridge -> scanner/actions/research/extractor`

## 2. 状态标签

- `PASS`
- `PARTIAL`
- `FAIL`
- `PENDING`

## 3. 主验收分层

| ID | 场景 | 目的 | 状态 | 备注 |
|---|---|---|---|---|
| A0 | 直答路由 | 明确可回答问题不触发 browser tool 执行 | PASS | `tests/query-compiler.test.ts`、`tests/runtime.test.ts`、`tests/sidepanel.test.ts` 覆盖 |
| A1 | session 生命周期 | start/stop/state/archive/run-log 沿当前 runtime 路径稳定 | PASS | public state 不暴露过程日志；archive 只保存终态结果；run-log 只保存工具级诊断 |
| A2 | content bridge | snapshot/action 通过当前 content message 和 fallback 注入桥执行 | PASS | `tests/runtime.test.ts` 和 runtime-tools 覆盖 |
| A3 | first-party tools | 四个 runtime-visible tools 保持稳定 contract 和结构化输出 | PASS | first-party contract/registry 测试覆盖 |
| A4 | public research/site overview | 搜索、候选过滤、页面读取、覆盖边界和 final synthesis 不回退到未来路径 | PASS | public-research、site-overview、runtime loop 测试覆盖 |
| A5 | side panel | 输入、会话历史、最小运行占位、最终结果、artifact 操作和简短错误提示稳定 | PASS | 不展示 runtime debug panel、timeline、日志或 thinking 过程 |

## 4. 基础检查

| ID | 检查项 | 方法 | 状态 | 备注 |
|---|---|---|---|---|
| B1 | 项目可构建 | `npm run build` | PASS | 本轮收敛后已通过 |
| B2 | 全量测试 | `npm test` | PASS | 18 files / 127 tests |
| B3 | 类型检查 | `npx tsc --noEmit` | PASS | 本轮删除后已通过 |
| B4 | 主链静态检查 | `git grep` future-pattern check | PASS | 未来 driver/facade/QA route 关键词无结果 |

## 5. 禁止作为验收依据

- 未接入当前主链的 driver、facade、bridge 或 schema 测试。
- 只证明 mock 行为、但没有当前 runtime caller 的测试。
- 只描述未来迁移方向的文档。
- 仅因文件名、历史计划或“以后可能有用”而保留的能力。
- 前端过程 UI、debug panel、timeline 或调试日志展示。
- 包含思考链或中间推理过程的 run log、public state 或 archive。

更新日期：2026-05-11
