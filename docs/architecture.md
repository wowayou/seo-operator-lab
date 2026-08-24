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

## Quest module contract

Each formal Quest lives under `src/quests/wordpress/<slug>-<sequence>/`:

```text
quest.json       learner-facing metadata and authoring contract
blueprint.json   deterministic WordPress fixture
validator.ts     pure evaluation helpers plus Playground adapter
index.ts         module export consumed by the automatic registry
```

The registry uses Vite's `import.meta.glob()` to discover `index.ts` files. Adding a Quest does not require editing a central switch statement or the UI. Drafts live under `_drafts/` and are intentionally excluded until complete.

## Validation boundary

Every result contains:

- `target` checks: the reported symptom is fixed;
- `regression` checks: required unrelated behavior remains correct;
- `expected` and `actual` evidence for every check;
- an optional post-pass implementation review.

`targetPassed` is exposed separately so the UI can say “the symptom disappeared, but a regression was introduced.” The final `passed` value requires every target and regression check. AI is not involved in this decision.

## Reset and Quest switching

The npm client does not expose a lifecycle destroy method. Reset and Quest switching replace the iframe, discard the current client, and boot the selected Blueprint again. A confirmation dialog protects both actions from silently discarding edits.

## Adding a new Quest

1. Run `npm run quest:new -- <slug> "<Title>"`.
2. Complete the draft TODOs and write deterministic target/regression checks.
3. Run `npm run validate:quests`, `npm run check`, and the focused Validator tests.
4. Move the completed directory from `_drafts/` into `src/quests/wordpress/`.
5. Add the Quest to the browser matrix in `scripts/browser-smoke.mjs` before calling it complete.

## Agent benchmark boundary

`src/agent/` adds a second consumer of the same Quest contract. It gives a non-human operator a programmatic tool surface over `PlaygroundClient` and records what happened, without changing Quest or Validator code. `validate()` stays outside that tool surface, so the verdict remains the one the human UI produces. See [agent-benchmark.md](agent-benchmark.md).

Progress, scoring, mastery, persistence, and export remain later phases. This architecture intentionally does not let those concerns leak into the runtime contract yet.
