# Browser Agent Status

## Current Phase

`browser-core-v2-controlled-rebuild`

## Current Checkpoint

The default runtime path is now:

`START_SESSION -> BrowserAgentRuntime shell -> Browser Core V2 runtime loop`

The old workflow loop is no longer the main execution path.

The current non-direct execution shape is:

`taskSpec -> bounded round executor -> decideRoundAction -> finalize | replan | abort`

`direct_answer` still bypasses this gate and finalizes immediately.

## What Is Live Now

- `BrowserAgentRuntime` still owns session lifecycle, publish, stop, archive, and error handling.
- Session bootstrap is now `taskSpec`-first. Startup compiles a stable `taskSpec` and builds a coarse display plan for the side panel.
- The default Browser Core V2 runtime loop dispatches by task family instead of using the old `allowedTools -> chooseToolForStep -> getToolDefinition()` path.
- First-party LLM-visible tool contracts are frozen and wired into the Browser Core V2 runtime path:
  - `browser.search`
  - `browser.webDetail`
  - `browser.siteOverview`
  - `skill.commerceResearch`
- The current non-direct loop now supports a bounded second round:
  - execute one coarse tool round
  - build shared round evidence from candidates / sources / items / issues
  - call `decideRoundAction`
  - either `finalize`, `replan`, or `abort`
- Existing finalizers remain in place:
  - `finalizeDirectAnswer`
  - `finalizeResearchResult`
  - `finalizeCommerceResult`
- `commerce_search` is already on the new runtime path, but its skill delegate still reuses legacy commerce helpers internally.

## Current Task Paths

- `direct_answer`
  - `finalizeDirectAnswer`

- `public_research`
  - `browser.search`
  - `browser.webDetail` batch
  - `decideRoundAction`
  - `finalizeResearchResult` or round 2

- `site_overview`
  - `browser.search` only when official entry must be resolved
  - `browser.siteOverview`
  - `decideRoundAction`
  - `finalizeResearchResult` or round 2

- `commerce_search`
  - `skill.commerceResearch`
  - `decideRoundAction`
  - `finalizeCommerceResult` or round 2

## What Was Reused From Legacy Code

- task family semantics from `direct_answer / public_research / site_overview / commerce_search`
- task compilation and route/query refinement
- research candidate filtering
- final synthesis tools
- legacy commerce helpers inside the commerce skill delegate

These are now adapters or helpers, not the main runtime loop.

## What Is No Longer True

- The old runtime loop is not the main chain anymore.
- Non-direct tasks do not always finalize immediately after one tool round.
- `status.md` should be treated as a current snapshot, not an append-only progress log.

## Main Gaps

- The current replanning model is still coarse:
  - it patches the current `taskSpec`
  - it does not yet run a generic `RoundPlanSchema`
  - it does not yet support arbitrary multi-step per-round plans from the LLM
- The current Browser Core V2 browser driver is still a runtime adapter over:
  - `chrome.tabs`
  - `waitForTabComplete`
  - `sendMessageToTab`
  - content-bridge actions
- `StoreSafeDriver` as the final Chrome wiring target is still pending.
- Real-browser S1/S2/S3 style validation for the new multi-round gate is not yet the source-of-truth checkpoint.
- `skill.commerceResearch` still depends on a legacy helper delegate rather than a fully native Browser Core V2 implementation.

## Current Risks

- The new multi-round gate improves control flow, but the runner is still task-family-specific. It is not yet a fully generic bounded planner.
- Replanning only patches fields inside the current task family. It cannot yet do richer strategy transfer between tool patterns.
- Because the current browser driver is still an adapter, real-browser stability can differ from mock/integration results.
- Some unrelated repository type errors still exist outside this slice, so full `tsc --noEmit` is not yet a green gate.

## Next Recommended Step

1. Lift the current round-end decision model into an explicit bounded `RoundPlanSchema`.
2. Move from task-family-specific executors toward a generic per-round plan runner.
3. Keep `open / observe / read / extract` inside Browser Core V2 internals; do not expose them directly to the LLM.
4. Validate the new finalize-or-replan gate in real browser sessions for:
   - `public_research`
   - `site_overview`
   - `commerce_search`
5. Reduce the remaining legacy dependency inside `skill.commerceResearch`.

## Latest Validation

- Passed:
  - `npm test -- tests/llm-client.test.ts tests/runtime.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts`
  - `npm test -- tests/runtime.test.ts tests/llm-client.test.ts tests/browser-core-v2/runtime-v2-loop.test.ts tests/browser-core-v2/first-party-tool-contracts.test.ts tests/browser-core-v2/first-party-tool-registry.test.ts tests/public-research.test.ts tests/site-overview.test.ts tests/sidepanel.test.ts`
  - `npm run build`

- Not fully green:
  - `npx tsc --noEmit`
  - Remaining failures are outside this slice, including:
    - `src/background/tools/read-research-source-facts.ts`
    - `tests/session-archive.test.ts`
    - `tests/sidepanel.test.ts`

Updated: 2026-04-22
