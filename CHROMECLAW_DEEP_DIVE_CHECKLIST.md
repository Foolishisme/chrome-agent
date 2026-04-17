# ChromeClaw Deep Dive Checklist

Updated: 2026-04-17

## 1. Purpose

This checklist is for a focused deep dive into
<https://github.com/algopian/chromeclaw>.

The goal is not to copy ChromeClaw directly. The goal is to decide whether
ChromeClaw should become:

- the primary base for our browser plugin general agent,
- a reference implementation whose ideas are selectively migrated, or
- only a source of isolated browser-control techniques.

Our target product is a browser plugin general agent that can support:

- precise research,
- general research,
- finding source material,
- current-page understanding,
- navigation,
- site overview,
- shopping search,
- controlled browser actions,
- human takeover and auditability.

## 2. Non-Goals

Do not start by rewriting our project around ChromeClaw.

Do not evaluate ChromeClaw only as a Playwright/CDP replacement.

Do not treat every ChromeClaw feature as in scope. Voice, Telegram, WhatsApp,
scheduler, workspace files, local LLM, and broad assistant integrations are
secondary unless they materially affect the browser agent base.

Do not expose raw browser actions to the LLM in our product direction without
separate safety review.

## 3. Expected Output

The deep dive should produce a short decision document answering:

- Should we fork ChromeClaw as the main base?
- Should we keep our current codebase as the main base and migrate selected ideas?
- Which modules should be copied conceptually, rewritten, or ignored?
- What is the first migration experiment?
- What permissions and security tradeoffs are acceptable?
- What parts of our current implementation remain valuable?

Recommended final recommendation format:

```text
Decision: adopt / partially adopt / do not adopt
Reason:
Adopt:
Do not adopt:
First experiment:
Risks:
Revisit trigger:
```

## 4. Repository Orientation Checklist

Clone or fork ChromeClaw into a separate reference workspace.

Recommended local layout:

```text
D:\code\browser-agent-mvp          current project
D:\code\chromeclaw-reference       reference clone or fork
```

Inspect at minimum:

- `README.md`
- `chrome-extension/manifest.ts`
- `chrome-extension/src/background/agents/`
- `chrome-extension/src/background/tools/`
- `chrome-extension/src/background/tools/browser.ts`
- `chrome-extension/src/background/tools/cdp.ts`
- `chrome-extension/src/background/tools/debugger.ts`
- `chrome-extension/src/background/`
- `chrome-extension/src/offscreen/`
- `chrome-extension/src/sidepanel/`
- `chrome-extension/src/options/`
- storage, memory, settings, provider, and tool registry modules
- tests and build scripts

Record:

- package manager,
- build command,
- extension loading workflow,
- minimum browser permissions,
- provider setup requirements,
- whether it runs locally without cloud services.

## 5. Product Fit Checklist

Answer these before looking too deeply at implementation details.

- Does the Side Panel feel close to the browser assistant product we want?
- Can a user understand what the agent is doing while it runs?
- Can the user stop or take over safely?
- Does it support current-page context naturally?
- Does it support multi-turn task continuity?
- Does it keep useful history and artifacts?
- Does it distinguish chat answers from browser task execution?
- Does it expose browser state clearly enough for debugging?
- Does it handle tool failure in a user-comprehensible way?
- Is the default product scope too broad for our MVP?

Decision signal:

- Strong fit: its shell can become a base or direct design reference.
- Medium fit: copy the layout and state concepts, but keep our app.
- Weak fit: only inspect browser-control internals.

## 6. Architecture Mapping

Map ChromeClaw concepts to our current architecture.

```text
ChromeClaw assistant shell      -> our future browser assistant shell
ChromeClaw browser tool         -> our Browser Capability Layer candidate
ChromeClaw CDP/debugger layer   -> our CdpDriver candidate
ChromeClaw tool registry        -> our tool registry / skill registry candidate
ChromeClaw agent loop           -> compare with our runtime loop
ChromeClaw memory/storage       -> compare with our SessionMemory and archives
ChromeClaw offscreen document   -> future MV3 lifecycle mitigation
ChromeClaw permissions          -> our permission and safety model
```

Compare against our current invariants:

- `Agent = LLM + Tools + Memory + Runtime`
- `LLM plan-driven tool orchestration`
- runtime-visible tools return high-level `ToolResult`
- browser actions return lower-level `ActionResult`
- memory stores structured working state, not full noisy page dumps
- final result must be structured as `success / partial / failed / blocked`

Identify which invariants still make sense for a general browser assistant and
which should be revised.

## 7. Agent Loop Checklist

Inspect how ChromeClaw runs agent iterations.

Questions:

- Where is the main loop?
- How does it choose tools?
- How does it stop?
- Does it support tool budgets?
- Does it support user interruption?
- Does it stream intermediate status?
- How are tool errors represented?
- How are repeated failures handled?
- How does it maintain context across turns?
- Does it compact or summarize context?
- Does it distinguish planning, execution, and final response?
- Can reliable workflows be embedded as higher-level tools?

Compare with our runtime:

- static initial plan,
- allowed tools per step,
- retry guardrails,
- no-progress guardrails,
- final result fallback,
- structured timeline.

Risk to watch:

- If ChromeClaw lets the LLM freely call browser actions without enough action
  budget, confirmation, or task-level constraints, it may be flexible but less
  safe than our current approach.

## 8. Tool System Checklist

Inspect tool registration and execution.

Questions:

- How are tools declared?
- Are schemas typed and validated?
- Are tools enabled or disabled by settings?
- Can tools be grouped by capability?
- Can high-risk tools require explicit user approval?
- Can tools return artifacts?
- Can tools return structured facts?
- Can tools be composed into reliable workflows?
- Is there a difference between internal tools and LLM-visible tools?
- How are browser tools documented for the model?

Map ChromeClaw tools into categories:

- browser control,
- page observation,
- network/console,
- memory,
- files/workspace,
- providers,
- integrations,
- scheduler,
- communication channels,
- custom/evaluate tools.

For our product, classify each as:

- adopt now,
- adopt later,
- internal only,
- reject.

## 9. Browser Capability Layer Checklist

Inspect `browser.ts`, `cdp.ts`, and debugger-related modules.

Core capabilities to evaluate:

- list tabs,
- open tab,
- close tab,
- focus tab,
- navigate,
- reload,
- snapshot,
- content extraction,
- screenshot,
- click by ref,
- type by ref,
- evaluate JavaScript,
- console logs,
- network logs,
- iframe handling,
- shadow DOM handling,
- popup/new tab handling,
- attachment and reattachment,
- tab crash or detach recovery.

For each capability record:

```text
Capability:
Implementation:
Uses CDP:
Uses content script:
Needs debugger permission:
Returns structured data:
Has fallback:
Can map to our SnapshotData/ActionResult:
Risks:
```

Important design question:

- Should our product expose a generic browser tool to the LLM, or should browser
  actions remain internal behind higher-level workflows?

Likely target:

```text
General assistant mode:
  limited browser actions visible to LLM

Reliable workflow mode:
  browser actions hidden inside workflow tools
```

## 10. Observation Model Checklist

Evaluate ChromeClaw page observation.

Questions:

- Does it use accessibility snapshots, DOM snapshots, or both?
- Does it assign stable refs?
- Are refs bound to elements, coordinates, or backend node IDs?
- Does it preserve role/name/state/bounds?
- Does it capture visible text separately from interactive elements?
- Does it include screenshot fallback?
- Does it avoid dumping full DOM into the model?
- Does it handle large pages?
- Does it handle virtualized lists?
- Does it handle iframe and shadow DOM?
- Does it dedupe repeated nodes?

Compare with our current model:

- `SemanticSnapshot`
- `InteractiveElement`
- `PageFacts`
- `SnapshotData`
- `SourceFactCard`

Decision:

- Keep our snapshot schema and improve it,
- adopt ChromeClaw snapshot shape,
- or create a compatibility layer.

## 11. Action Execution Checklist

Evaluate action reliability.

Questions:

- Does click use DOM events, CDP coordinates, or both?
- Does type use DOM assignment, keyboard events, CDP input, or both?
- Are events trusted by the page?
- How does it wait after actions?
- Does it auto-scroll before clicking?
- Does it check visibility and hit target?
- Does it handle overlays?
- Does it handle stale refs?
- Does it retry?
- Does it capture screenshots or traces on failure?
- Does it support drag and drop?
- Does it support file upload?
- Does it support keyboard shortcuts?
- Does it support cross-origin iframe actions?

Classify each action:

```text
Safe default:
Needs confirmation:
Experimental:
Out of scope:
```

For our product, high-risk actions should include:

- login submission,
- sending messages,
- checkout,
- payment,
- account changes,
- deleting data,
- uploading sensitive files,
- accepting legal or financial commitments.

## 12. MV3 Lifecycle and Offscreen Checklist

Inspect how ChromeClaw handles Manifest V3 constraints.

Questions:

- Does it use an offscreen document?
- What runs in the service worker?
- What runs in offscreen?
- What state survives service worker suspension?
- How are long-running streams handled?
- How are provider requests executed?
- How does it reconnect?
- Does it rely on unsupported keepalive hacks?
- Does it store in-flight task state durably?

Compare with our current risks:

- provider live request validation,
- long task reliability,
- stop/error/budget visibility,
- session state recovery.

Decision:

- no offscreen yet,
- adopt offscreen for provider streaming,
- adopt offscreen for browser task runtime,
- adopt offscreen only after real MV3 failures.

## 13. Storage and Memory Checklist

Inspect storage and memory.

Questions:

- What data goes into Chrome storage?
- What data goes into IndexedDB?
- Are conversations persisted?
- Are tool calls persisted?
- Are browser snapshots persisted?
- Are artifacts persisted?
- Is memory searchable?
- Is memory user-editable?
- Is data scoped by workspace/profile/conversation?
- How is sensitive browser data protected?
- Can data be exported or cleared?

Compare with our memory rules:

- structured facts only,
- no long noisy page dumps by default,
- source facts should be dehydrated,
- final result must preserve sources and blockers.

Decision:

- reuse concepts,
- reuse storage shape,
- or keep our own session/archive model.

## 14. Provider and Model Checklist

Inspect provider abstraction.

Questions:

- Which providers are supported?
- How are API keys stored?
- Is local LLM supported?
- Does it support streaming?
- Does it support tool calling across providers?
- Does it normalize provider errors?
- Does it support model-specific prompts?
- Does it separate planner, summarizer, and final writer models?
- Can tools be restricted per provider?

Compare with our needs:

- external/local profile,
- provider live request validation,
- source fact card dehydration,
- reliable final synthesis,
- cost and latency control.

## 15. UI and UX Checklist

Inspect side panel, options, and task views.

Questions:

- Is the browser task timeline visible?
- Are tool calls visible?
- Are browser actions visible?
- Are screenshots or snapshots shown?
- Can user interrupt?
- Can user approve high-risk actions?
- Can user configure enabled tools?
- Can user configure providers?
- Can user inspect artifacts?
- Can user retry from failure?
- Can user continue a prior task?
- Is current tab context visible?

Compare with our UI:

- session state,
- timeline,
- inline/artifact final output,
- logs,
- stop button,
- conversation turns.

Adoption candidates:

- options/settings layout,
- tool enablement UI,
- browser action timeline,
- artifact browser,
- memory management,
- provider profile UI.

## 16. Security and Permissions Checklist

Inspect extension permissions and user trust implications.

For each permission, record:

```text
Permission:
Why ChromeClaw needs it:
Whether we need it now:
Whether it can be optional:
User-facing risk:
Mitigation:
```

Special attention:

- `debugger`
- `<all_urls>`
- `scripting`
- `tabs`
- `offscreen`
- `identity`
- `cookies`
- `declarativeNetRequest`
- host permissions

Decide:

- default permissions for MVP,
- experimental permissions,
- enterprise-blocking permissions,
- permissions that require explicit user education.

## 17. Workflow Migration Checklist

Evaluate whether our current workflows can migrate into ChromeClaw-like tools.

Our current workflows:

- `direct_answer`
- `public_research`
- `site_overview`
- `commerce_search`

For each workflow answer:

```text
Workflow:
Current value:
ChromeClaw equivalent:
Can become a high-level tool:
Needs custom memory:
Needs custom final result:
Needs browser driver changes:
Migration complexity:
Should migrate first:
```

Recommended first migration experiment:

```text
site_overview explicit_url
```

Reason:

- no search engine dependency required,
- no shopping anti-bot dependency,
- exercises navigation, snapshot, one-hop links, page reading, failure skipping,
  and final synthesis.

## 18. General Browser Assistant Mode Checklist

If we adopt a more general assistant mode, define its safety envelope.

Allowed by default:

- explain current page,
- summarize selected page content,
- open a URL,
- switch tabs,
- screenshot current page,
- find links on current page,
- click by visible ref after snapshot,
- type into low-risk fields,
- navigate back or open in new tab.

Needs confirmation:

- submit forms,
- send messages,
- log in,
- accept terms,
- change account settings,
- delete content,
- purchase or checkout,
- upload files,
- run custom JavaScript,
- use debugger/CDP on sensitive pages.

Out of scope for initial general assistant:

- payment,
- order placement,
- bypassing CAPTCHA,
- extracting cookies or secrets,
- uncontrolled background browsing,
- deep site crawling,
- raw credential handling.

## 19. Evaluation Matrix

Score each area from 1 to 5.

```text
Area                         Score  Notes
Product shell
Agent loop
Tool registry
Browser capability layer
Observation model
Action reliability
MV3 lifecycle handling
Storage and memory
Provider abstraction
UI/UX
Security/permissions
Workflow migration fit
Testability
Maintainability
```

Suggested interpretation:

- 4-5: strong candidate to adopt or directly adapt.
- 3: useful reference, but needs redesign.
- 1-2: avoid or only study for pitfalls.

## 20. Adoption Decision Criteria

Adopt ChromeClaw as base only if all are true:

- It runs locally with acceptable setup cost.
- Its browser tool is stable enough on common websites.
- Its agent loop can host reliable workflows without fighting the architecture.
- Its UI shell is closer to our target than our current shell.
- Its permission model is acceptable or can be reduced.
- Our `site_overview` migration experiment is straightforward.
- Removing unrelated features does not create excessive hidden coupling.

Partially adopt if:

- CDP/browser control is useful,
- UI or settings are useful,
- but agent loop or product scope conflicts with our target.

Do not adopt if:

- browser control is brittle,
- permissions are unacceptable,
- feature coupling is too high,
- reliable workflows are hard to embed,
- or the product shell does not match our direction.

## 21. First Spike Plan

Recommended spike duration: 3-5 working days.

Tasks:

1. Clone/fork ChromeClaw into a reference workspace.
2. Build and load the extension locally.
3. Configure one provider.
4. Run current-page Q&A.
5. Run browser navigation on 3 public websites.
6. Inspect browser tool call logs.
7. Inspect CDP attach/reattach behavior.
8. Inspect offscreen behavior.
9. Attempt a minimal `site_overview explicit_url` workflow mapping.
10. Fill the evaluation matrix.

Spike result should recommend one of:

- migrate to ChromeClaw base,
- keep our base and migrate selected modules,
- continue independent implementation with only conceptual references.

## 22. Migration Path If ChromeClaw Is Adopted

If adopted as base, migrate in this order:

1. Disable or hide non-core integrations.
2. Keep Side Panel, Options, provider setup, tool registry, browser tool.
3. Add our `SourceFactCard` and research result model.
4. Add `site_overview` as a high-level workflow tool.
5. Add `public_research` as a high-level workflow tool.
6. Add `commerce_search` as a constrained shopping workflow.
7. Add safety confirmations for risky browser actions.
8. Add our final result structure or equivalent artifact contract.
9. Revisit memory and archive model.
10. Revisit prompt/tool guidance for precise research.

## 23. Migration Path If Our Base Is Kept

If our current project remains the base, migrate ideas in this order:

1. Add a Browser Capability Layer.
2. Wrap current content-script execution as `ContentScriptDriver`.
3. Add a `CdpDriver` spike using ChromeClaw as reference.
4. Add tab lifecycle APIs.
5. Add screenshot support.
6. Add snapshot refMap improvements.
7. Add a limited general browser assistant mode.
8. Add tool enable/disable settings.
9. Add offscreen only when long-running MV3 failures are observed.
10. Expand workflows into skills while keeping safety boundaries.

## 24. Open Questions

- Should the final product be pure extension only, or extension plus local runtime?
- Are users willing to grant `debugger` permission?
- Should generic browser actions be visible to the model by default?
- How should we separate general assistant mode from reliable workflow mode?
- How much ChromeClaw UI and storage complexity do we want to inherit?
- Should precise research remain our differentiating capability?
- What is the first shopping scenario that can be made safe and reliable?
- How should artifacts, citations, and source fact cards appear in the UI?
- What is the minimum viable permission set for a public MVP?

