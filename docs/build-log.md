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

## Workspace hardening plan — 2026-10-13

Baseline: local `main`, `origin/main`, Pages deployment `35812406683`, and the live HTML all match `313e8e3`. The live HTML SHA-256 also matches a fresh local build. Baseline checks: 35 unit tests, Quest validation, TypeScript and production build pass. `npm audit` reports two high-severity development dependency findings (`fast-uri`, `source-map-js`).

Acceptance slices (completed locally; commit/publication still require authorization):

1. **Unobstructed learning workspace:** persistent, labeled validate/editor/help controls; a docked inspector that never covers WordPress; automatic collapse while editing/on narrow screens and in fullscreen; deliberate reopen/pin controls; keyboard-accessible tabs and a replayable beginner walkthrough. Every current Quest must explain the exact edit and WordPress save action without auto-applying an answer.
2. **Trustworthy runtime and Quests:** bounded boot/validation/navigation, no stale results after reset, visible recovery and no unhandled startup rejection; restricted embedded runtime; patched vulnerable dependencies. Both Quests need baseline FAIL, narrow lab PASS, regression FAIL, reset FAIL and a site-owned production-path review based on runtime evidence rather than source-text matching. Cover malformed HTML, conflicting robots/header directives, broken structured data and upgrade-safety boundaries.
3. **Verification and next Quest:** run static/unit/build/audit checks, human browser matrix at desktop and mobile, and reference-agent calibration. Record artifact sizes and limitations. Plan (do not prematurely publish) the next redirect Quest with observable acceptance criteria and rollback boundaries in the existing scaling guide.

Keep WordPress/PHP and hosted-client versions pinned during this work. Do not add accounts, scoring, automatic repairs, scheduled CI, or external services. Publishing and any destructive/external action require explicit authorization.

### Implemented and verified

- Commands now remain above the workspace. Desktop inspection is docked (never over the editor), automatically collapses on editing, can be pinned, and starts hidden in fullscreen/compact layouts. The inline opt-in guide highlights actual controls; exact-edit disclosures name the real editor file, first-use warning and **Update File** save button. Success feedback stays in the inspector rather than covering WordPress.
- Noindex has a third, publicly indexable control plus a stable list filter and a Site Overrides exercise. Its generic exclusion control cannot be satisfied with only a crawler-specific rule. Learner copy explicitly says noindex is not access control and PASS is not a search-indexation guarantee.
- Both validators use inert HTML5 parsing and stronger regression evidence. Product JSON-LD must be meaningful, not merely tagged. A raw `/` request was observed returning 301 in the scoped Playground; the collector uses WordPress's resolved front-page permalink instead of weakening the HTTP 200/homepage canonical requirement.
- Runtime generations reject stale boots/results, serialize operations, bound boot/operation waits and expose manual recovery without retry loops. The editor remains available to copy work after an operation timeout. The outer iframe is sandboxed; the shell has a restrictive meta CSP and indexable metadata/robots/sitemap.
- `fast-uri` is updated to 3.1.8 and `source-map-js` to 1.2.2. `npm ci` succeeds; `npm audit` reports zero vulnerabilities. The new pinned parse5 dependency and its entities dependency are used only when validating.
- The held-out graph guard now actually visits glob-loaded Quests and lazy validators, including JSON and TS/TSX/MJS test leaks. Direct filesystem path checks reject control bytes/backslashes. Documentation corrects the old claim that `runPhp` was constrained to `/wordpress`: the guard is lexical, not a PHP security sandbox. The dev agent runner now replaces the current frame, rejects overlapping runs and bounds boot waits.
- The Pages workflow keeps its original push/manual triggers and serial deployment, adds the existing unit suite before build, scopes publish permissions to deployment, pins top-level actions and adds 10-minute job timeouts. Repository visibility and GitHub's free standard-runner/Pages compute policy were checked before changing automation. No scheduled browser matrix, extra runner job or automatic retry was added; the artifact action retains files for one day.

Verification actually run on 2026-10-13:

| Check | Result |
| --- | --- |
| Clean `npm ci`, TypeScript, metadata and official Blueprint validation | PASS |
| `npm test` | **107 tests / 6 files PASS**, including negative authoring CLI cases and refusal to overwrite a draft |
| `npm run build` and `npm audit` | PASS; **0 vulnerabilities** |
| `test:ui` with mocked runtime transport | PASS, repeated after responsive-event timing and copy-feedback checks; **no external runtime requests**; 320, 390, 768, 1050 and 1440px |
| Real `test:browser` on development server | PASS: both documented lab repairs, both overbroad regression failures, both site-owned paths, cancelled switch, reset and 390px editor |
| Real `test:browser` on a served production artifact | **Final artifact PASS**: correct production editor tooltip/directions, both documented lab/production paths, regressions, reset and 390px. One prior cold-boot run failed on an upstream module download and is recorded separately below. |
| `test:agent` | Eight expected records; overbroad policies fail with target passed, production policies receive the site-owned review; no page errors |
| Built artifact inspection | Canonical/indexable shell, CSP, iframe restrictions and relative assets confirmed; no agent harness or source maps in the artifact |
| Workflow static validation | YAML, unchanged triggers/concurrency, scoped permissions, SHA pins and timeout/test gates checked; **not executed remotely** |

Screenshots and machine-readable reports are generated under gitignored `artifacts/current/`; the final production matrix is under `artifacts/current/final/`, and the earlier passing/failed production attempts remain under `artifacts/current/production/`. Historical artifacts remain untouched. Two test synchronization issues were fixed rather than masking failures: waiting for the nested editor's navigation before editing its previous document, and waiting for responsive media-query events before clicking the resized layout.

Measured build trade-off (minified size; gzip in parentheses): CSS **35.04 → 15.91 kB** (**7.64 → 4.18 kB**, about 55% less raw CSS); entry JavaScript **44.85 → 54.11 kB** (**15.11 → 18.53 kB**) because the guide/recovery flow is richer. The parser/evidence chunk is **161.37 kB / 49.54 kB gzip**, deferred until validation. The upstream client remains **501 kB / 123.73 kB gzip**. This does not establish faster cold WordPress downloads; the improvement is less CSS/layout layering and no eager parser load or duplicate/stale runtime work.

The official hosted runtime intermittently failed asset downloads during checks (including a WASM stream fetch failure). Complete human/agent matrices passed, but one final cold-boot attempt failed before validation with `Failed to fetch dynamically imported module: https://playground.wordpress.net/assets/php_8_3-DWGAjLGu.js` (`net::ERR_FAILED`). The UI exposed startup failure and manual retry. A subsequent HTTP HEAD returned 200; after that observation, **one explicitly bounded manual rerun passed the entire final production matrix**. No retry loop or alternate asset fallback was added. The cause of the intermittent browser download failure is not established, and a persistent/global upstream outage is not claimed. Network availability, full production security certification, Safari/Firefox execution and the modified remote deployment workflow remain outside what was verified here.

The end-of-task remote check still reports `313e8e3` and Pages run `35812406683`; live HTML SHA-256 remains `c76bd753abc5408dca48ee2ddd62d5ab5ca78ee1217f89231fad00ad88fe67c3`. Changes remain uncommitted/unpublished locally. Final local acceptance is complete; obtain explicit commit/publication authorization before changing the live site.

The next Quest contract is in [quest-scaling-analysis.md](quest-scaling-analysis.md#next-quest-003--redirect-chain-planned-not-shipped): a one-hop permanent legacy redirect, with temporary/unrelated controls, query preservation, loop/open-redirect boundaries and a reversible site-owned repair. No third Quest has been published or created as a misleadingly complete draft.

## Release and Quest 003 implementation — 2026-10-13

The user authorized publishing the completed workspace/two-Quest hardening, then implementing the planned redirect-chain Quest. The published slice must pass the existing checks and Pages workflow; verify the live artifact before calling release complete. The new Quest is implemented on a separate branch so incomplete work cannot auto-deploy from `main`.

The user also reported slow temporary-site startup. Initial local preview measurements: the outer HTML returned HTTP 200 in 5–58 ms across three requests; hosted `remote.html` returned 200 in about 0.80s. These are not full WordPress boot timings. Measure actual browser readiness and failed/slow runtime resources on the live release; do not claim moving from localhost fixes external PHP/WordPress download latency, and do not introduce auto-retry loops or unverified mirrors.

Quest 003 acceptance is the contract in [quest-scaling-analysis.md](quest-scaling-analysis.md#next-quest-003--redirect-chain-planned-not-shipped): bounded, scope-safe GET tracing; deterministic initial FAIL; one-hop permanent lab PASS; temporary/public/query/security regressions; site-owned production PASS; Reset FAIL; actionable beginner instructions; unit, authoring, browser and reference-policy coverage. No new accounts, scores, external services or recurring browser jobs are required.

Status: release verification and Quest implementation pending.

## Constraints and follow-up

1. The hosted Playground still requires network access and can occasionally fail while downloading WASM assets; the UI exposes a retryable environment error.
2. The npm client and hosted remote runtime should remain version-aligned; the project pins `@wp-playground/client` `3.1.50`.
3. Add the planned redirect-chain Quest as independently verifiable HTTP-evidence, fixture/evaluator and learner-workflow slices; do not batch the remaining Quests before that contract is proven.
4. Every benchmark number the harness currently produces is open-book: both Quests are readable in the deployed bundle. The held-out seam is built and guarded, but no held-out Quest is authored, so per-Quest results still measure retrieval as much as diagnosis. Creating the private repository is the remaining human step.
