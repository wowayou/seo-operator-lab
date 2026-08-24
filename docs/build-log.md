# Phase A/B Build Log

## Scope

Phase A proved the uncertain WordPress Playground loop for Duplicate Canonical. Phase B now abstracts that loop into a Quest contract and adds Accidental Noindex. Progress, scoring, persistence, export, LLM features, and the remaining three Quests remain out of scope.

## Phase A evidence

The original acceptance sequence was:

```text
fresh boot       -> Validate -> FAIL
manual edit      -> Validate -> PASS
Reset            -> Validate -> FAIL
```

The parent app reads the runtime's dynamic `home_url()` and validates rendered HTML through `PlaygroundClient.request()`. Reset replaces the iframe because the pinned client exposes no lifecycle destroy method. The Phase A visual and runtime evidence remains in the `artifacts/phase-a-*` screenshots.

## Phase B implementation

- Quest discovery: Vite `import.meta.glob()` discovers each formal `index.ts`; no central Quest switch is needed.
- Quest metadata: each Quest has `quest.json` with target, editor, hints, success, review, and future scoring fields.
- Blueprint: each Quest has a pinned WordPress 6.7/PHP 8.3 `blueprint.json` with the official Playground schema URL.
- Validator: each Quest exports pure evaluation helpers plus a small Playground adapter. Results contain target checks, regression checks, expected/actual evidence, and optional implementation review.
- Author tooling: `npm run validate:quests` runs Ajv metadata validation and the official `validateBlueprint()` API. `npm run quest:new -- <slug> "<Title>"` creates a safe `_drafts` scaffold.

### Canonical Quest

The fixture's Product Suite emits both the deliberate duplicate canonical and a required Product Schema. It also creates a stable front page for a homepage regression.

Observed browser path:

```text
initial target FAIL (two canonical links, Product Schema preserved)
line edit PASS (target + Product Schema + homepage regression)
production challenge Reset -> FAIL again
Site Overrides remove_action PASS (production review)
```

The production review demonstrates a site-owned `remove_action()` override so the vendor plugin source does not need to be edited for a real deployment.

### Noindex Quest

The fixture creates an indexable `field-notes` page and an intentionally noindex `private-reference` control page.

```text
initial target FAIL (target has noindex, control retains noindex)
target-only condition edit PASS (target indexable, control still noindex)
Reset -> FAIL again
```

This proves that an overbroad “remove every noindex” change cannot satisfy the Quest.

## Browser run - 2026-08-19

The Playwright smoke drove both Quests, three progressive hints per Quest, the nested WordPress Plugin File Editor, the one-time warning, the Canonical production challenge, Quest switching, Reset, and mobile runtime navigation. The final run reported:

```text
Canonical: FAIL -> lab PASS -> Reset FAIL -> production PASS
Noindex:   FAIL -> PASS -> Reset FAIL
consoleErrors: []
```

The expected `Transition was skipped` page errors and aborted `remote.html` requests occur when an old iframe is intentionally replaced during Reset; they are filtered as benign cancellation signals. No browser console errors were reported.

Evidence:

- [Canonical initial FAIL](../artifacts/phase-b-canonical-fail.png)
- [Canonical lab PASS](../artifacts/phase-b-canonical-lab-pass.png)
- [Canonical production PASS](../artifacts/phase-b-canonical-production-pass.png)
- [Noindex initial FAIL](../artifacts/phase-b-noindex-fail.png)
- [Noindex PASS](../artifacts/phase-b-noindex-pass.png)
- [Responsive 390px screenshot](../artifacts/phase-b-mobile.png)
- Automated driver: [`scripts/browser-smoke.mjs`](../scripts/browser-smoke.mjs)

## Phase B usability refinement

- Validation evidence is now an inline disclosure: the whole check row is the click target, and the evidence panel stays in document flow on desktop and mobile.
- Production-level reviews can provide `why`, ordered `steps`, and a copyable exact instruction. The Canonical Quest now names the Plugin File Editor path, explains why Site Overrides protects vendor upgrades, and separates the pasted hook from the surrounding explanation.
- The browser smoke covers row-level evidence expansion and the production guide's four actionable steps.
- The Playground client is dynamically imported at boot, reducing the initial application chunk to about 39 kB while keeping the runtime dependency isolated.

## Phase B workspace layout

The two-column page became one opinionated workspace shell:

- The Quest inspector is a right-side panel with three tabs (任务 / 验证 / 提示). Running a validation switches to 验证; opening the Plugin File Editor switches back to 任务. The earlier layout switcher was removed, and its `seo-operator-lab:workspace-layout` preference is cleaned up on boot.
- The inspector is resizable by pointer drag and by keyboard on the `separator` handle (340-560px, capped so the runtime keeps 520px). The chosen width persists in `seo-operator-lab:mission-panel-width`.
- Collapsing the inspector does not move or resize the runtime iframe, so WordPress is never re-laid-out mid-task. The reopen control lives in the top bar.
- The runtime has a fullscreen mode using the native Fullscreen API with a viewport-sized fallback when it is unavailable. `F` toggles fullscreen and `[` toggles the inspector, both suppressed inside text inputs and while the reset dialog is open.
- Added `public/favicon.svg` so the tab is branded instead of showing Vite's default request.

The browser smoke now asserts the inspector resize (keyboard and pointer), width persistence, the runtime's unchanged geometry across collapse, tab switching, the shortcuts, and that fullscreen fills the viewport. All `artifacts/phase-b-*` screenshots were regenerated from this layout.

## Agent benchmark harness - 2026-08-25

The Phase C prerequisite was verified: a non-human operator can complete a Quest
programmatically. `PlaygroundClient` already exposes `readFileAsText`,
`writeFile`, `listFiles`, `fileExists`, `request`, and `run`, so the harness adds
no new runtime capability — it instruments what the client already provides and
withholds `validate()` from the tool surface.

`npm run test:agent` drove seven deterministic reference policies in the headless
shell. Observed:

```text
observeOnly                 fail   targetPassed=false  regressions=0
canonicalLabRepair          pass   targetPassed=true   review=lab
canonicalProductionRepair   pass   targetPassed=true   review=production
canonicalOverbroadRepair    fail   targetPassed=true   regressions=1  (product-schema-preserved)
noindexNarrowRepair         pass   targetPassed=true   regressions=0
noindexOverbroadRepair      fail   targetPassed=true   regressions=1  (control-noindex-preserved)
escapeAttempt               error  validationCount=0
pageErrors: []
```

The two overbroad rows are the result that matters. Both made the reported symptom
disappear — a transcript would describe them as fixed — and both were recorded as
failures with the specific regression named. `escapeAttempt` was blocked by
`assertAllowedPath()` and produced no verdict.

Headless boot was also confirmed for the human matrix: `npm run test:browser`
completed with exit code 0 against `chrome-headless-shell` 149, regenerating every
`artifacts/phase-b-*` screenshot. The earlier assumption that no headless binary
was installed was wrong; the binary is named `chrome-headless-shell`, not `chrome`.

Task leakage was measured rather than assumed. The public bundle
`dist/assets/index-*.js` contains the fault-injection Blueprint source and the
Validator check ids `product-schema-preserved` and `private-reference`, because
Blueprints and validators are imported by the app. Making the repository private
would not change this. The harness itself does not leak: grepping the built bundle
for `AGENT_FS_ROOT`, `agentRun`, `referencePolicies`, `canonicalLabRepair`,
`AgentSession`, `buildRunRecord`, `regressionsIntroduced`, and `escapeAttempt`
returned zero matches in `dist`, because Vite bundles only the root `index.html`.
See [agent-benchmark.md](agent-benchmark.md) for the threat model and the held-out
Quest requirement.

## Held-out Quest seam - 2026-08-25

The leakage finding above is structural, so the seam for a private Quest set was
built: `src/quests/heldout/` is gitignored, and `src/agent/heldout.ts` loads it
through two `import.meta.glob` patterns that match nothing when the directory is
absent. A clone without the private checkout builds and tests unchanged.
`AgentRunRecord.heldOut` now labels every run and defaults to `false`, so an
open-book number cannot be mistaken for a held-out one.

`heldout-isolation.test.ts` enforces the invariant instead of documenting it: it
walks the real import graph from `src/main.ts` and fails if the loader is
reachable, if a `**` glob appears on the public graph, if the gitignore entry is
removed, or if `policies.ts` mentions `heldout`.

That test was verified by injecting four leak shapes and confirming each turns it
red: a side-effect import, a `from` import, a dynamic `import()`, and a widened
registry glob. **Its first implementation caught none of them.** The extractor
matched `import ... from '...'` with a lazy `[\s\S]*?`, so `import './x';` had no
`from` clause and was invisible, and the lazy span could skip intervening imports
by reaching a distant `from`. The rewritten extractor enumerates import shapes on
single-line anchors and carries a self-check asserting it finds each one. A leak
test that cannot fail is worse than no test, because it manufactures confidence.

`npm run test:agent` was re-run after the change: exit code 0, all seven reference
records unchanged, every record now carrying `heldOut: false`, and the report
footer reading `none present (private checkout absent; all numbers above are
open-book)`. The vitest suite is 35 tests across 3 files.

`src/quests/http.ts` was added for the first held-out Quest: `request()` returns
raw `headers` as `Record<string, string[]>` and does not follow redirects, so
redirect-shaped faults are observable and no public Quest uses that shape.

Creating the private repository was deliberately left to a human. It decides what
the benchmark measures, and automation should not claim a repository on the
account's behalf.

## Constraints and follow-up

1. The hosted Playground still requires network access and can occasionally fail while downloading WASM assets; the UI exposes a retryable environment error.
2. The npm client and hosted remote runtime should remain version-aligned; the project pins `@wp-playground/client` `3.1.50`.
3. Before Phase C, standardize shared evidence helpers for redirects, HTTP, robots, structured data, and JSON-LD, then add the remaining three WordPress Quests through the scaffold.
4. Every benchmark number the harness currently produces is open-book: both Quests are readable in the deployed bundle. The held-out seam is built and guarded, but no held-out Quest is authored, so per-Quest results still measure retrieval as much as diagnosis. Creating the private repository is the remaining human step.
