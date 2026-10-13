# SEO Operator Lab Architecture

## Runtime flow

```text
Quest registry
  -> metadata + Blueprint + validator
  -> startPlaygroundWeb(Blueprint)
  -> user edits the embedded WordPress runtime
  -> Quest validator requests rendered HTML
  -> target checks + regression checks
  -> PASS/FAIL + implementation review
```

The parent page owns orchestration. WordPress owns the mutable environment. A Quest validator is the only module that knows which URLs, HTML signals, and runtime files matter for that Quest.

- `src/main.ts`: Quest rendering, evidence and confirmed rebuild actions.
- `src/runtime.ts`: one client per generation, bounded async operations and stale-result rejection. A failed boot removes its frame; an operation timeout stops new requests without silently deleting learner edits.
- `src/ui/workspace.ts`: dock/sheet state, pin/width preferences, accessible tabs and native/viewport fullscreen.
- `src/ui/onboarding.ts`: an opt-in inline guide pointing at real controls, not a modal blocking the editor.
- `src/ui/dom.ts`: icons and clipboard selection fallback. Runtime evidence is always rendered through `textContent`, never HTML insertion.

The command bar lives outside the inspector and remains usable when it closes. Known WordPress editor navigation and explicit edit/preview actions collapse an unpinned inspector. Fullscreen always starts collapsed. Compact sheets make the covered canvas inert, not the controls.

## Quest module contract

Each formal Quest lives under `src/quests/wordpress/<slug>-<sequence>/`:

```text
quest.json       learner-facing metadata and authoring contract
blueprint.json   deterministic WordPress fixture
validator.ts     pure evaluation helpers plus Playground adapter
index.ts         module export consumed by the automatic registry
```

The registry uses Vite's `import.meta.glob()` to discover `index.ts` files. Metadata and Blueprints are eager; each module dynamically imports its validator only when requested. Thus the HTML5 parser is not part of initial workspace load. Adding a Quest does not require editing a central switch statement or the UI. Drafts live under `_drafts/` and are intentionally excluded until complete.

## Validation boundary

Every result contains:

- `target` checks: the reported symptom is fixed;
- `regression` checks: required unrelated behavior remains correct;
- `expected` and `actual` evidence for every check;
- an optional post-pass implementation review.

`targetPassed` is exposed separately so the UI can say “the symptom disappeared, but a regression was introduced.” The final `passed` value requires every target and regression check. AI is not involved in this decision.

`src/quests/html.ts` uses parse5 for non-executing HTML5 parsing, ignoring comment/script/template lookalikes and decoding attribute entities. Explicit head evidence is required; inspection is bounded to 2,000,000 characters per response. Canonical checks require meaningful Product JSON-LD, not a marker count, and the unchanged homepage canonical. The adapter requests WordPress's resolved front-page permalink: a raw `/` request can be a scoped-runtime redirect.

Noindex checks combine HTML and all `X-Robots-Tag` values, include generic/Googlebot/Bingbot rules and expand `none`. Restrictive directives win. Public pages must have no relevant noindex; the excluded control must retain a **generic** noindex, not just one crawler's restriction. This is not a full robots.txt, canonical, access-control or real search-index simulation.

Implementation reviews use `src/quests/review.ts`: a production-path label requires an unchanged vendor fixture, an active/changed site-owned plugin and a runtime-effective rule. A matching code string or comment alone is not sufficient. The label remains bounded evidence, not a comprehensive deployment/security assessment.

## Reset and Quest switching

The npm client does not expose a lifecycle destroy method. Reset and Quest switching replace the iframe (without copying its scoped `src`), invalidate the old generation and boot the selected Blueprint again. A confirmation dialog protects both actions and the production exercise. Late client, navigation and validation callbacks cannot update the new Quest. Only one validation/navigation operation is accepted at a time; boot and operation waits are limited to 180s and 30s, without automatic retries.

The outer iframe is cross-origin and sandboxed with scripts/forms/same-origin/modal/download capabilities needed by the lab, but no top-navigation or popup capability. A restrictive shell CSP is delivered as a meta policy; GitHub Pages cannot deliver arbitrary custom response headers. The hosted runtime is still trusted infrastructure, and its version may move independently of the pinned npm client.

## Adding a new Quest

1. Run `npm run quest:new -- <slug> "<Title>"`.
2. Complete the draft TODOs and write deterministic target/regression checks.
3. Run `npm run validate:quests`, `npm run check`, and the focused Validator tests.
4. Move the completed directory from `_drafts/` into `src/quests/wordpress/`.
5. Add the Quest to the browser matrix in `scripts/browser-smoke.mjs` before calling it complete.

## Agent benchmark boundary

`src/agent/` adds a second consumer of the same Quest contract. It gives a non-human operator a programmatic tool surface over `PlaygroundClient` and records what happened, without changing Quest or Validator code. `validate()` stays outside that tool surface, so the verdict remains the one the human UI produces. See [agent-benchmark.md](agent-benchmark.md).

Progress, scoring, mastery, persistence, and export remain later phases. This architecture intentionally does not let those concerns leak into the runtime contract yet.
