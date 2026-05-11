# Browser Agent MVP

这是一个基于 Chrome Extension Manifest V3 的浏览器 Agent MVP。

产品目标：
`大众用户可用的通用浏览器 Agent`

核心模型：
`Agent = LLM + Tools + Memory + Runtime`

当前执行模型：
`LLM-driven bounded tool loop + RuntimeBrowserDriver + content bridge`

## 当前结构

主源码入口：

- `src/background/runtime/`
- `src/background/runner/`
- `src/background/tools/`
- `src/background/llm/`
- `src/background/browser/overview/explicit-url-overview.ts`
- `src/background/browser/capability/types.ts`
- `src/content/bridge.ts`
- `src/content/index.ts`
- `src/content/scanner.ts`
- `src/content/actions.ts`
- `src/content/research.ts`
- `src/content/extractor.ts`
- `src/shared/`
- `src/sidepanel/`

Side Panel 负责启动和停止会话、展示当前目标和必要进度，并在对话流中呈现最终结果。

runtime-visible tools 通过当前 tool 层注册并返回结构化结果。浏览器控制细节留在 `RuntimeBrowserDriver`、content bridge 和 content action 内部。

## 文档入口

优先阅读：

- [doc/spec.md](./doc/spec.md)
- [doc/constraints.md](./doc/constraints.md)
- [doc/checkpoint.md](./doc/checkpoint.md)
- [doc/acceptance.md](./doc/acceptance.md)

辅助文档：

- [doc/interaction.md](./doc/interaction.md)
- [doc/writing_rules.md](./doc/writing_rules.md)

## 开发命令

安装依赖：

```powershell
npm install
```

运行测试：

```powershell
npm test
```

构建扩展：

```powershell
npm run build
```

监听构建：

```powershell
npm run dev
```

## 环境变量

使用 [`.env.example`](./.env.example) 作为本地模板。

关键变量：

```env
VITE_LLM_PROVIDER=openai-compatible
VITE_LLM_API_KEY=
VITE_LLM_BASE_URL=http://localhost:11434/v1
VITE_LLM_MODEL=deepseek-chat
VITE_LLM_SIMPLE_MODEL=deepseek-chat
VITE_LLM_SIMPLE_MODEL_FALLBACK=deepseek-chat

VITE_GEMINI_API_KEY=
VITE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/models
VITE_GEMINI_MODEL=gemini-2.0-flash
VITE_GEMINI_SIMPLE_MODEL=gemini-3.1-flash-lite-preview
VITE_GEMINI_SIMPLE_MODEL_FALLBACK=gemini-2.5-flash-lite
```

`VITE_LLM_BASE_URL` 填 provider 根地址即可；应用会按需补 chat 或 Gemini model 路径。

## 加载到 Chrome

1. 运行 `npm run build`。
2. 打开 Chrome 扩展管理页。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”。
5. 选择项目的 `dist/` 目录。

更新日期：2026-05-11
