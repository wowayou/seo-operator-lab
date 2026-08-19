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

## Constraints and follow-up

1. The hosted Playground still requires network access and can occasionally fail while downloading WASM assets; the UI exposes a retryable environment error.
2. The npm client and hosted remote runtime should remain version-aligned; the project pins `@wp-playground/client` `3.1.50`.
3. Before Phase C, standardize shared evidence helpers for redirects, HTTP, robots, structured data, and JSON-LD, then add the remaining three WordPress Quests through the scaffold.
