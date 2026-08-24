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

**Status:** Accepted for Canonical Quest

The Canonical Quest accepts any result satisfying target and regression checks. Its optional post-pass challenge resets the fixture and opens a site-owned override plugin, where `remove_action()` can remove the vendor hook without editing vendor code.

**Consequence:** Learners first prove the bug/fix loop, then see upgrade-safe implementation quality as an explicit second objective. The Validator does not enforce a single source-code diff.

## ADR-008: The Agent tool surface excludes the Validator

**Status:** Accepted

`AgentSession` exposes read, write, list, probe, fetch, and PHP execution, all confined to `/wordpress`. It does not expose `validate()` as a tool. An Agent may request a verdict, but the Validator reads the runtime itself through the same code path the human UI uses.

An alternative was considered and rejected: a declarative `checks: [{type, selector, expected}]` JSON DSL, so that adding a Quest would not require code. The Canonical Validator refutes it. Its expected canonical is read at runtime from `home_url()` because every boot receives a new scope URL, and its homepage regression resolves `page_on_front` before requesting a permalink. Expressing that in JSON requires an expression language; the cost lands on every future Quest.

**Consequence:** A benchmark PASS means exactly what a human PASS means, and cannot be argued with by the party under test. Reuse comes from shared evidence helpers such as `src/quests/html.ts`, not from configuration.

## ADR-009: Published Quests are open-book by construction

**Status:** Accepted, with a known gap

Blueprints and validators are imported by the app, so Vite compiles them into `dist/assets/index-*.js`. The deployed bundle contains the fault-injection source and the Validator's check ids. Making the repository private does not change this; neither does obfuscation or serving Blueprints from a backend, because the fixture must reach the browser to boot.

The Agent harness is kept out of the artifact instead: Vite bundles only the root `index.html`, so `agent-run.html`, `src/agent/**`, and the reference policies stay unbuilt. This is verified by grepping the built bundle for the harness identifiers.

**Consequence:** Results for the two current Quests measure retrieval as much as diagnosis and must be labeled open-book. A trustworthy benchmark requires a held-out Quest set authored outside this repository. `AgentRunRecord` records `disclosure` but has no "unseen" field, because at present no Quest qualifies. See [agent-benchmark.md](agent-benchmark.md).
