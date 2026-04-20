# Browser Core V2 文件框架

Updated: 2026-04-20

## 定位

`Browser Core V2` 是当前浏览器 Agent 的参考重写主线，目录为：

- 产品仓库：`D:\code\browser-agent-mvp`
- ChromeClaw 参考仓库：`D:\test\chromeclaw`
- 新主线目录：`D:\code\browser-agent-mvp\src\browser-core-v2`

本目录是隔离的 rewrite island，不是把旧 MVP 主链就地大重构。旧 `runtime / tools / workflow / content` 保留为历史、对照、fallback 或 harness；新主线闭环成立前，不删除旧代码，不把新 browser tool 注册进旧 `tools/registry.ts`。

ChromeClaw 只用于静态阅读、行为抽取和测试样本参考；不向 `D:\test\chromeclaw` 写入实现改动。

## 目录树

```text
src/browser-core-v2/
  README.md
  index.ts

  shared/
    types.ts
    contracts.ts
    result.ts
    page-problems.ts

  content/
    index.ts
    bridge.ts
    dom-snapshot.ts
    element-refs.ts
    readable-content.ts
    markdown.ts
    links-controls.ts
    page-state.ts
    page-problems.ts
    interactions.ts
    trimming.ts

  background/
    index.ts
    drivers/
      store-safe-driver.ts
      content-script-client.ts
    facade/
      browser-tool-schema.ts
      browser-tool.ts
    overview/
      explicit-url-overview.ts
    policy/
      action-risk.ts
    trim/
      result-trimmer.ts
    downloads/
      README.md

  test-support/
    mock-browser-session.ts
```

测试目录：

```text
tests/browser-core-v2/
  readable-content.test.ts
  dom-snapshot.test.ts
  browser-tool-schema.test.ts
```

## 职责

`shared/`：

- 只放跨 background/content 的类型、结果 helper 和问题结构。
- 复用现有 Phase 0 `BrowserCapabilityLayer / BrowserDriver` 契约。
- 不访问 DOM，不访问 Chrome API。

`content/`：

- 页面内 JS/DOM 能力。
- 默认使用 Vanilla JS 原生 DOM API。
- `readable-content.ts` 使用 `@mozilla/readability`。
- `markdown.ts` 使用 `turndown` 生成 markdown excerpt。
- `dom-snapshot.ts / links-controls.ts / element-refs.ts` 输出稳定 refs、links、controls。
- `interactions.ts` 只放低风险 click/type/press/scroll 原语，后续必须由 policy gate 控制。

`background/`：

- background 侧 driver、content-script client、LLM-facing browser tool facade、overview harness 和结果裁剪。
- 当前不注册进现有 runtime。
- `StoreSafeDriver` 以现有 `BrowserDriver` 为目标接口。
- `content-script-client.ts` 当前是未接线边界；下一步再接 `chrome.scripting`。

`downloads/`：

- 仅预留未来 `chrome.downloads` API 归属。
- 当前不请求 `downloads` 权限，不实现下载工具。

## 当前可用

- `@mozilla/readability + turndown` 的可读内容提取和 markdown excerpt。
- Vanilla DOM snapshot。
- links / controls / stable refs。
- LLM-facing 最小 action schema：
  - `open`
  - `navigate`
  - `observe`
  - `read`
  - `extractLinksAndControls`
  - `finalize`
- browser tool schema 明确拒绝：
  - `debugger`
  - `cdp`
  - raw `evaluate`

## 后置入口

- `StoreSafeDriver` 接 `chrome.tabs / chrome.scripting`。
- `explicit_url overview via StoreSafeDriver` 独立闭环。
- 低风险交互的 action risk gate 和确认 UI。
- 一跳页面读取、批量读取、页面裁剪和 result shaping。
- `CdpDriver` 作为 advanced/local/enterprise driver。
- `chrome.downloads` 下载能力。

## 红线

- 不把 Browser Core V2 文件散落进旧主目录。
- 不让 runtime-visible tool 暴露 raw DOM、raw selector、raw evaluate 或 raw CDP。
- 不默认依赖 `debugger` / CDP。
- 不默认 `<all_urls>`。
- 不把 `cookies / identity / declarativeNetRequest / downloads` 纳入第一阶段默认权限。
- 不把旧 workflow 当作长期产品边界。
