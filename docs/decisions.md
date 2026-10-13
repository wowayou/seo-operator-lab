# Phase A/B Technical Decisions

## ADR-001: Use the official hosted Playground runtime

**Status:** Accepted for Phase A

The spike uses `@wp-playground/client` `3.1.50` with `https://playground.wordpress.net/remote.html`. The package version is exact and the lockfile is committed because protocol drift between the npm client and hosted runtime is a known risk.

**Consequence:** The spike remains a static Vite application, but first boot requires network access to WordPress Playground assets.

## ADR-002: Validate rendered output from outside WordPress

**Status:** Accepted

The parent application requests `/sample-product/` through `PlaygroundClient.request()` and parses the returned HTML. A read-only `home_url()` call supplies the runtime-specific expected canonical because every Playground boot receives a new scope URL.

**Consequence:** PASS/FAIL is deterministic and independent of AI while remaining correct across Reset-created scopes.

## ADR-003: Reset by replacing the iframe

**Status:** Accepted for Phase A

`PlaygroundClient` does not expose a lifecycle `destroy()` method. Reset replaces the iframe and starts the same Blueprint again.

**Consequence:** Runtime modifications are discarded and the initial fault returns. The old iframe may emit benign cancellation signals while it is removed.

## ADR-004: Stop before Quest abstraction

**Status:** Superseded by Phase B

The Duplicate Canonical fixture, validator, and runtime controls stay spike-specific. `quest.json`, multiple Quest loaders, progress, persistence, and game mechanics are Phase B or later concerns.

**Consequence:** Phase A proved the uncertain runtime loop. Phase B now introduces the smallest abstraction needed to add a second Quest without copying UI or runtime code.

## ADR-005: Directory-as-registry Quest modules

**Status:** Accepted for Phase B

Formal Quests live in `src/quests/wordpress/<slug>-<sequence>/` and export one `QuestDefinition`. The registry uses Vite `import.meta.glob()` rather than a hand-maintained central list. Drafts live under `_drafts/` and are excluded from TypeScript and discovery until complete.

**Consequence:** Adding a Quest is local to its directory. The authoring validator can enforce required files, unique ids, unique sequence numbers, and target/Blueprint alignment.

## ADR-006: Target and regression checks are separate

**Status:** Accepted

Validators expose `targetPassed` separately from final `passed`. The target group proves the reported symptom disappeared; the regression group protects required unrelated behavior. Final PASS requires both groups.

**Consequence:** A broad workaround can be acknowledged without being called complete. Maintainability and elegance remain post-pass review signals unless they are observable product constraints.

## ADR-007: Production solutions are reviewable alternatives

**Status:** Accepted for both current Quests (expanded 2026-10)

Both Quests accept any result satisfying target and regression checks. Their optional post-pass challenges reset the fixture and open a site-owned override plugin: Canonical removes the vendor's duplicate hook; Noindex filters out only the erroneous page, keeping other and future exclusions.

**Consequence:** Learners first prove the bug/fix loop, then examine upgrade safety as an explicit second objective. The review requires vendor baseline equality, an active/changed override and runtime-effective behavior, not a matching source string. It is labeled as the observed site-owned path, not universal production certification; the PASS gate remains behavior-based.

## ADR-008: The Agent tool surface excludes the Validator

**Status:** Accepted

`AgentSession` exposes read, write, list, probe, fetch, and PHP execution. Direct filesystem arguments are lexically checked under `/wordpress`; **correction (2026-10): this does not confine arbitrary `runPhp` code or symlink resolution**, so it is not a security sandbox. No secrets or host mounts belong in this runtime. It does not expose `validate()` as a tool. An Agent may request a verdict, but the Validator reads the runtime itself through the same code path the human UI uses.

An alternative was considered and rejected: a declarative `checks: [{type, selector, expected}]` JSON DSL, so that adding a Quest would not require code. The Canonical Validator refutes it. Its expected canonical is read at runtime from `home_url()` because every boot receives a new scope URL, and its homepage regression resolves `page_on_front` before requesting a permalink. Expressing that in JSON requires an expression language; the cost lands on every future Quest.

**Consequence:** A benchmark PASS means exactly what a human PASS means, and cannot be argued with by the party under test. Reuse comes from shared evidence helpers such as `src/quests/html.ts`, not from configuration.

## ADR-009: Published Quests are open-book by construction

**Status:** Accepted, with a known gap

Blueprints and validators are imported by the app, so Vite compiles them into `dist/assets/index-*.js`. The deployed bundle contains the fault-injection source and the Validator's check ids. Making the repository private does not change this; neither does obfuscation or serving Blueprints from a backend, because the fixture must reach the browser to boot.

The Agent harness is kept out of the artifact instead: Vite bundles only the root `index.html`, so `agent-run.html`, `src/agent/**`, and the reference policies stay unbuilt. This is verified by grepping the built bundle for the harness identifiers.

**Consequence:** Results for the two current Quests measure retrieval as much as diagnosis and must be labeled open-book. A trustworthy benchmark requires a held-out Quest set authored outside this repository; ADR-010 builds that seam. See [agent-benchmark.md](agent-benchmark.md).

## ADR-010: Held-out Quests live in a gitignored private checkout

**Status:** Accepted for the seam; no held-out Quest authored yet

ADR-009 leaves one structural fix: a Quest set that is never published. The seam is `src/quests/heldout/`, a gitignored directory holding a checkout of a separate private repository. `src/agent/heldout.ts` loads it through `import.meta.glob` and exports empty collections when the directory is absent, so a clone without the private checkout builds and tests unchanged.

Three properties are enforced rather than documented:

1. `heldout.ts` is imported only by `src/agent/run.ts`, which Vite never builds. The public registry glob stays single-segment (`./wordpress/*/index.ts`) so it cannot descend into a sibling directory.
2. `AgentRunRecord.heldOut` labels every run and defaults to `false` — a Quest is open-book unless proven otherwise.
3. `heldout-isolation.test.ts` walks the real import graph from `src/main.ts` and fails if the loader becomes reachable, if a `**` glob appears on the public graph, if the gitignore entry is dropped, or if the public `policies.ts` mentions `heldout`.

Reference repairs for held-out Quests live beside their Quest in the private checkout, because a reference repair is the answer.

**Consequence:** The public repository can carry the benchmark machinery without carrying the benchmark's answers. Creating the private repository stays a human decision: it defines what the benchmark measures. Until one exists, every number the harness produces is open-book, and `heldOut: false` says so on every record.

## ADR-011: A leak-detection test must be proven able to fail

**Status:** Principle accepted; extractor implementation superseded by ADR-014

The first `heldout-isolation.test.ts` passed against four deliberately injected leaks: a side-effect import, a `from` import, a dynamic `import()`, and a widened registry glob. Its extractor required a `from` clause, so `import './x';` was invisible, and a lazy `[\s\S]*?` could skip intervening imports by matching a distant `from`. The suite was green and guarded nothing.

**Consequence:** The original repair enumerated import shapes explicitly and carried a self-check asserting it found each one. Any test whose only job is to detect a dangerous condition must be validated by producing that condition and observing the failure. A guard that cannot fail is worse than no guard, because it manufactures confidence.

## ADR-012: Docked inspection with explicit, persistent commands

**Status:** Accepted, supersedes the overlay layout described in the 2026-08 build log

The overlay inspector hid WordPress UI and contained the only validation/edit controls. Now commands remain in a top bar, the desktop inspector consumes its own grid column, and editing collapses it unless pinned. Compact screens use a deliberately opened sheet; fullscreen starts collapsed. An opt-in inline guide highlights actual buttons and can always be replayed.

**Consequence:** Collapsing really releases runtime width (the old unchanged-geometry assertion is intentionally replaced by a non-overlap assertion). There is no hover timer or cursor prediction. The learner can override automatic behavior by pinning on desktop, and hidden panels/canvas regions are inert where appropriate.

## ADR-013: HTML correctness is worth a lazy parser dependency

**Status:** Accepted

Regex inspection confused comments, script strings and `data-*` attributes with real SEO declarations and did not decode all HTML entities. The app now uses parse5 without executing HTML or fetching its resources. Validators and their parser are loaded on first validation rather than initial shell render; the pinned Playground client remains a separate lazy module.

**Consequence:** The correctness cost is an additional lazy parser/evidence chunk. CSS consolidation reduces layout/stylesheet weight, but richer guides increase the entry JavaScript slightly; do not claim cold WordPress boot is faster without measurement. Input is capped at 2,000,000 characters per response.

## ADR-014: Follow glob edges in the leakage guard

**Status:** Accepted

When validators became lazy imports, review found the old guard only recorded the registry glob's text and never visited the modules it matched. A leak inside a Quest would therefore be invisible. The guard now parses TypeScript syntax, expands literal glob patterns/arrays and follows the actual Quest, lazy validator and JSON edges. Non-literal imports/globs fail inspection rather than being silently ignored.

**Consequence:** A temporary injected glob-to-validator-to-JSON leak proves reachability, and the public test asserts the Noindex validator is actually visited. This replaces the old regex extractor described in ADR-011 while preserving its central rule: a guard must be proven capable of detecting the condition it claims to prevent.
