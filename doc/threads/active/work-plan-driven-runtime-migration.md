# Work Thread

## 1. 基本信息

- Thread: `work-plan-driven-runtime-migration`
- Status: `DOING`
- Owner: `Codex + user`
- Related taskModule: `commerce_search / public_research`
- Updated: `2026-04-07`

## 2. 本轮结论

本线程原目标是把主链从过渡态收口到明确的 v1：

- 一套 canonical tool
- 一套高层 `ToolResult`
- 一套 `FinalResult`
- `currentPhase` 退出主链
- runtime 改为 canonical plan loop

本轮目标已完成。

## 3. 已完成事项

- 新增 ADR：
  - `doc/adr/0002-converge-runtime-tool-contracts.md`
- 协议收口：
  - `src/shared/types.ts`
  - `src/shared/schema.ts`
- tools 拆分：
  - `src/background/tools/`
  - `src/background/tools.ts` 已退化为 barrel export
- runtime 收口：
  - `src/background/runtime-core.ts`
  - `src/background/runtime.ts`
- side panel 同步：
  - `src/sidepanel/index.ts`
  - `src/sidepanel/i18n.ts`
- 自动化测试已更新到 canonical 契约
- `spec / constraints / plan / status / acceptance` 已同步

## 4. 验证

- `npm.cmd test`
  - 9 个测试文件，60 个测试通过
- `npm.cmd run build`
  - 通过

## 5. 剩余事项

- `commerce_search` 真机闭环记录
- stop / error / budget guardrails 真机可视化记录
- provider live validation
- 基于真实失败模式评估是否继续细拆 tool

## 6. 接手建议

接手时先看：

- `src/background/runtime-core.ts`
- `src/background/tools/registry.ts`
- `src/shared/types.ts`
- `doc/spec.md`
- `doc/status.md`
- `doc/acceptance.md`

当前不要做：

- 恢复旧 alias tool
- 恢复 `currentPhase`
- 在没有真实证据前继续细拆 tool
- 引入执行中动态改 plan
