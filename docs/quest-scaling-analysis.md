# Quest Scaling Analysis

## Findings

The main maintenance risk is not the number of screens. It is the number of independent runtime fixtures and validator edge cases. A central UI with Quest-specific branches would make every new challenge a regression risk.

The chosen architecture addresses that risk with four boundaries:

1. **Directory-as-registry**: Vite discovers Quest modules automatically, so adding a Quest does not require a central edit.
2. **Schema-first authoring**: Quest JSON has a local schema for editor completion and `ajv` validation; malformed metadata fails before the runtime starts.
3. **Official Blueprint validation**: `validate-quests.mjs` calls `@wp-playground/client`'s `validateBlueprint()` in addition to JSON parsing. This catches invalid Playground steps before a hosted boot.
4. **Target/regression separation**: common UI can render any number of checks without knowing SEO semantics, while each Validator owns its evidence collection.

## Official references checked

- [Blueprints getting started](https://wordpress.github.io/wordpress-playground/blueprints/getting-started)
- [Blueprint data format](https://wordpress.github.io/wordpress-playground/blueprints/data-format)
- Official JSON schema: `https://playground.wordpress.net/blueprint-schema.json`
- Installed API: `validateBlueprint()` from `@wp-playground/client` `3.1.50`

The official documentation describes Blueprints as JSON and recommends the schema URL above. The installed client also exposes a local Blueprint validator, so authoring checks do not need to duplicate Playground's step schema.

## Recommended growth path

### Now: Phase B

- Keep two real Quests on the shared contract.
- Keep authoring checks and the browser matrix green.
- Avoid progress, scoring, accounts, and LLM integration.

### Next: one independently verifiable Quest before a larger Phase C batch

- Start with the redirect-chain contract below, not three fixtures at once.
- Extend the existing HTTP helpers only for observed redirect needs; keep the current HTML/robots/JSON-LD evidence reusable.
- Require the same documented lab edit, production-path review, negative tests and browser acceptance as the first two Quests. No new screens, accounts or scoring are prerequisites.

### Later

- Phase D can consume the existing `id`, hints, attempts, and review interval fields without changing runtime validation.
- A future solution-review layer may classify update safety or blast radius, but it should never replace deterministic target/regression checks.

## Next Quest 003 — Redirect Chain (planned, not shipped)

**Proposed id:** `wp-redirect-chain-003` · **Title:** 多跳的旧页面重定向 · difficulty 2/5.

**Learning goal:** after a URL migration, distinguish a temporary redirect from a permanent one, inspect the whole HTTP path rather than just the final page, and make a narrow, reversible rule change. This naturally builds on canonical and indexability without requiring a new runtime/UI.

### Deterministic fixture and acceptance

| Case | Required observation |
| --- | --- |
| Fresh fault | `/old-field-notes/` → **302** `/notes-bridge/` → **301** `/field-notes/` → **200**; target fails, controls pass |
| Narrow repair | Legacy URL reaches `/field-notes/` in **one hop**, with **301 or 308** and a usable `Location` |
| Final page | HTTP 200, expected canonical and content remain; no new noindex |
| Intentional temporary control | `/preview-notes/` remains **302** to its documented destination; a blanket “make every redirect permanent” patch fails |
| Unrelated public control | `/other-notes/` remains HTTP 200, not redirected |
| Benign query | A specified `?source=guide` value survives the documented migration; no arbitrary target is accepted from query data |
| Security boundary | A `?to=https://outside.invalid/` value cannot create an open redirect; external/scheme-relative external destinations are rejected, even if the final path looks right |
| Reset | Restores the original multi-hop, temporary first redirect and FAIL |

Scope is **GET requests only**. Do not imply 301 and 308 have identical POST semantics. No request to a real external destination is needed to create or test the fault.

### Experimental versus production path

- **Lab path:** a deliberately readable redirect map in a fixture-owned vendor plugin; change only the legacy mapping/status. Provide three hints plus exact before/after code, editor filename and **Update File** instructions.
- **Production exercise:** reset and use a named filter from Site Overrides. Change only the matching legacy rule; preserve existing and future unrelated rules. Verify vendor baseline equality, override activation/change and the resulting behavior. No generic global redirect hook that rewrites every request.
- **Rollback:** disable the site-owned override in a preproduction copy and repeat the probes. Permanent redirects can be cached by browsers/proxies; a successful fresh probe is not proof all real caches were purged. Never teach edits to a live vendor plugin as deployment practice.

### Verification slices and stop conditions

1. **HTTP evidence only:** test relative and absolute `Location`, case-insensitive/multiple headers, missing or conflicting locations, loops, non-redirect 304, wrong destination, cross-origin/scheme changes, encoded paths, query preservation and runtime scope prefixes. `pathOf()` alone does not establish same-origin safety or strip a Playground scope.
2. **Fixture plus evaluator:** fresh FAIL, narrow PASS, overbroad regression FAIL and failed/empty destination responses. Resolve URLs using the current scope origin, not string-prefix comparisons. Bound traversal to five hops within the existing operation deadline; stop immediately on a loop or forbidden origin. Do not add auto-retries.
3. **Learner workflow:** apply the documented edit through WordPress, validate, reset, complete the site-owned path; verify mobile buttons and auto-hiding inspector. Add one reference policy per meaningful outcome to the existing agent matrix.

Promote from `_drafts/` only when all slices pass. Keep it a public/open-book teaching Quest; publishing this fault disqualifies the same scenario as an unseen benchmark. This plan creates no draft, deployment, external service, scheduled job or new billing commitment.

## Tradeoff

JSON plus small TypeScript modules is more verbose than one giant configuration file, but it keeps Blueprint code, learner copy, and Validator logic close to the Quest. That locality is valuable when a fixture breaks against a new WordPress version. The authoring validator and scaffold offset the repetition without hiding the runtime behavior behind a large framework.
