# Quest Authoring Guide

## Start with the contract

```bash
npm run quest:new -- broken-redirect "Broken Redirect"
```

The command creates a draft under `src/quests/wordpress/_drafts/`. Drafts are not loaded by the app. Move the finished directory up one level only after all TODOs are complete.

## Blueprint rules

- Pin PHP and WordPress versions for deterministic behavior.
- Create all required content and plugins inside the Blueprint.
- Give every deliberate fault a stable marker such as `data-seo-lab="fault-name"`.
- Include at least one useful regression behavior that an overbroad fix could break.
- Set `landingPage` to the Quest target URL.
- Prefer named hooks and site-owned override paths when the Quest teaches production maintenance.
- Do not use a live production URL or a random external dependency to create the fault.

The official Blueprint schema is declared in each `blueprint.json` with:

```json
"$schema": "https://playground.wordpress.net/blueprint-schema.json"
```

## Metadata rules

`quest.json` owns learner-facing copy, target URL, three progressive hints, an opt-in `walkthrough`, editor path, success copy, and post-pass review. It also carries future review/scoring fields, but Phase B does not persist or calculate them.

`walkthrough` requires `concept`, at least four `steps`, exact `before`/`after` snippets, and a `caution` distinguishing an experiment from production. Name the real top-bar action, owning filename, first-use warning, **Update File** save button, success/error feedback and return-to-validation action. Do not rely on “left/right” positions or assume the learner recognizes an icon. The UI explicitly labels the answer disclosure and never applies the edit automatically.

The authoring check enforces ordered hint levels, matching pinned versions, created/active editor plugins, no remaining TODO copy and a `walkthrough.before` snippet that actually exists in the fixture. Existing draft directories are not overwritten by the scaffolder.

Hints should progress from evidence, to ownership, to the smallest useful change. Do not put the full solution in level 1.

For a `postPassReview.advancedChallenge`, add `why` and `steps` when the production path needs extra guidance. `description` should explain what the learner will see after starting the challenge, `steps` should name the editor location and the return-to-validation action, and `instruction` should contain only the exact code or configuration change. The UI renders the snippet with a copy action, so learners do not have to retype a long hook from memory.

## Acceptance checklist

- Fresh Blueprint produces a deterministic FAIL.
- Target checks fail for the intended symptom.
- A narrow repair produces PASS.
- An overbroad repair fails at least one regression check when that distinction matters.
- Reset returns to FAIL.
- The browser matrix applies the **documented** before/after edit through WordPress and checks save success, not merely an equivalent hidden patch.
- Each production path preserves the vendor source, uses a site-owned extension point and has a documented rollback boundary. A direct vendor edit can pass behavior checks but is labeled experimental.
- Cover relevant headers as well as HTML, malformed/empty responses and intentionally unaffected pages. Noindex must not be described as privacy protection.
- The browser matrix covers the Quest's editor path and mobile layout.
- `npm run validate:quests` reports the Quest.
- The Validator has pure unit tests for broken, repaired, and regression states.
