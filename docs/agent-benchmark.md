# Agent Benchmark Harness

## Why this exists

A chat transcript cannot answer "does this Agent know SEO?" An Agent can describe
a correct fix and still ship one that breaks something else. The harness answers a
narrower, checkable question: given a live broken WordPress runtime and no
privileged knowledge, does the Agent reach a state that satisfies every target
*and* regression check?

The Validator already produced that verdict for humans. The harness adds the
missing half: a programmatic tool surface so a non-human operator can act inside
the runtime, and a run record so two attempts are comparable.

## Architecture

```text
AgentBrief          what the Agent is told      (protocol.ts, disclosure-gated)
AgentToolSurface    what the Agent may do       (harness.ts, instrumented)
Quest validate()    what decides PASS/FAIL      (unchanged, not a tool)
AgentRunRecord      what is measured            (protocol.ts, pure)
```

The separation is the design. `validate()` is deliberately **not** part of the
tool surface: the Agent may request a verdict through `AgentSession.validate()`,
but it reads the runtime itself and cannot be argued with. This is the same code
path the human UI uses, so a benchmark PASS means exactly what a human PASS means.

`protocol.ts` is pure and unit-tested. `harness.ts` only adapts a live
`PlaygroundClient`. That boundary mirrors the existing Validator convention in
[validator-authoring.md](validator-authoring.md).

## Tool surface

`PlaygroundClient` already exposes everything an operator needs, so the harness
adds no new runtime capability:

| Tool | Client call | Purpose |
| --- | --- | --- |
| `readFile` | `readFileAsText` | inspect plugin and theme source |
| `writeFile` | `writeFile` | apply the repair |
| `listFiles` | `listFiles` | discover ownership |
| `fileExists` | `fileExists` | probe before writing |
| `fetchUrl` | `request` | observe rendered output |
| `runPhp` | `run` | query WordPress state |

Direct filesystem tool arguments are normalized and constrained to `/wordpress` by `assertAllowedPath()`, including rejection of control bytes and backslashes. **This is a lexical guard, not a security sandbox.** `runPhp` can access other paths in the PHP-WASM virtual filesystem, and symlinks can bypass lexical checks. Never mount secrets or host directories. The disposable cross-origin runtime is the boundary, not the helper. The lab's source/harness is not in that virtual filesystem, and this is not a task-leakage defense.

## What is measured

`AgentRunRecord` reports counts, not a score:

- `outcome`: `pass` / `fail` / `error`
- `toolCallCount`, `validationCount`
- `regressionsIntroduced`: validations where `targetPassed && !passed`
- `reviewLevel`: `lab` or `production`, from the Quest's own review

`regressionsIntroduced` is the measurement a transcript cannot produce. It counts
attempts where the reported symptom disappeared but required behavior broke.

Scoring is deliberately absent. `quest.json` already carries `scoring.base`,
`hintPenalty`, and `solutionPenalty`, and Phase B intentionally does not compute
them. A composite score needs a stable Quest set and a calibrated penalty model;
neither exists at two Quests. An uncalibrated number would look more
authoritative than it is.

## Disclosure levels

A result is only comparable against runs at the same level:

| Level | Adds |
| --- | --- |
| `minimal` | symptom, objective, target URL |
| `guided` | the editor file and its admin location |
| `hinted` | the three authored progressive hints |

`postPassReview` and the human-only exact-edit `walkthrough` are withheld at every level. They are still public teaching material in the website bundle, not secret benchmark answers.

## Calibration

`npm run test:agent` runs eight deterministic reference policies. They are
fixtures, not Agents under test. They exist to prove the harness distinguishes
outcomes that a transcript would describe identically:

| Policy | Expected |
| --- | --- |
| `observeOnly` | `fail`, target not passed — the authored fault is present |
| `canonicalLabRepair` | `pass`, review `lab` |
| `canonicalProductionRepair` | `pass`, review `production` |
| `canonicalOverbroadRepair` | `fail`, `targetPassed: true`, 1 regression |
| `noindexNarrowRepair` | `pass`, review `lab` |
| `noindexProductionRepair` | `pass`, review `production` |
| `noindexOverbroadRepair` | `fail`, `targetPassed: true`, 1 regression |
| `escapeAttempt` | `error`, no verdict produced |

The two overbroad policies are the reason the harness exists. Both make the
reported symptom disappear, so a symptom-only benchmark would score them as
successes. If those two ever report `pass`, the harness is broken regardless of
what any Agent scores.

## Threat model: task leakage

This is the unsolved problem, and it is worse than "the repository is public".

**Observed.** The production artifact's JavaScript chunks contain the
fault-injection Blueprint source and the Validator's check ids
(`product-schema-preserved`, `private-reference`). Validators and the HTML parser now load on demand, but are still public downloadable assets. Lazy loading is a performance boundary, not secrecy.

The Agent harness itself does not leak: Vite bundles only the root `index.html`,
so `agent-run.html`, `src/agent/**`, and the reference policies (which contain the
exact repairs) stay out of `dist`. This was verified by grepping the built bundle.

**Consequence.** Any Agent with web access can read the answer to both current
Quests. Published results for `wp-canonical-duplicate-001` and
`wp-accidental-noindex-002` measure retrieval as much as diagnosis, and must be
labeled that way.

**What does not fix it.** Obfuscation, minification, and moving the repository to
private are all defeated by one request to the deployed bundle. Serving Blueprints
from a backend only moves the leak: the fixture must reach the browser to boot.

**The only structural fix** is a held-out Quest set that is never published:
authored in a private repository, never built into the public site, and run
against a checkout the Agent cannot read. That splits the Quest set in two:

- **Public Quests** — teaching material and reproducible demos. Leakage is
  acceptable and expected; results are labeled "open-book".
- **Held-out Quests** — the actual benchmark. Kept private, rotated after any
  publication of per-Quest results.

## Held-out Quest mechanics

The seam for that split is built. It is a directory this repository never
contains:

```text
src/quests/heldout/<slug>-<seq>/    a checkout of a separate private repo
  quest.json  blueprint.json  validator.ts  index.ts
  policies.ts                      reference repairs — the answer, kept private
```

`src/quests/heldout/` is gitignored. `src/agent/heldout.ts` loads it through two
globs and exports nothing when the directory is absent, so a clone without the
private checkout builds and tests exactly as before.

Three properties make this safe, and each is enforced rather than documented:

1. **The public bundle cannot reach it.** `heldout.ts` is imported only by
   `src/agent/run.ts`, which Vite never builds. The public Quest registry glob is
   `./wordpress/*/index.ts` — single-segment, so it cannot descend into a sibling
   directory.
2. **`AgentRunRecord.heldOut`** marks every run, so an open-book number can never
   be mistaken for a held-out one. It defaults to `false`: a Quest is open-book
   unless proven otherwise.
3. **`heldout-isolation.test.ts`** walks the real import graph from `src/main.ts`
   and fails if the loader is reachable, if a `**` glob appears on the public
   graph, if the gitignore entry is removed, or if `policies.ts` mentions
   `heldout`.

The original test was checked with four direct leak shapes (side-effect import, `from` import, dynamic import and widened glob). The 2026-10 hardening found another blind spot: it inspected glob **patterns** without traversing the modules they loaded. That would miss an import from a Quest's lazy validator.

The guard now uses TypeScript's syntax tree, understands literal glob arrays, traverses matched modules (including JSON imports), resolves real paths and rejects opaque import/glob expressions. A temporary fixture injects a leak behind `registry glob → Quest module → lazy validator → JSON` and asserts the graph actually reaches it. Comments and quoted import examples are not executable edges. The public-graph assertion also requires the real Noindex validator to be visited, so lazy loading cannot silently remove the coverage.

**Still open.** No held-out Quest is authored yet, so every number this harness
currently produces is open-book. Creating the private repository is a deliberate
human step: it decides what the benchmark measures, and it must not be created
by automation on the account's behalf.

Authoring one, once that repository exists:

```bash
git clone <private-repo> src/quests/heldout   # gitignored; never committed here
npm test                                     # isolation guards must stay green
npm run test:agent                           # covers held-out Quests when present
```

A held-out Quest should not reuse a public fault type. `src/quests/http.ts` supplies reusable header and redirect helpers. Noindex now inspects response headers; the next planned public Quest exercises redirect chains. Neither that public plan nor its eventual fixtures should be reused as unseen answers.

## Status

Verified by execution, not by inspection:

- The loop boots, reads, writes, and validates programmatically in a headless
  browser (`chrome-headless-shell`), and the eight reference policies produce the
  eight expected records above. Each run replaces the actual current iframe; overlapping runs are rejected and boot waits are bounded to 180 seconds.
- Both overbroad repairs record `targetPassed: true` with `outcome: fail` — the
  distinction the harness exists to make.
- The held-out seam degrades correctly when the private checkout is absent: the
  agent smoke reports `heldOut: "none present"` and every run is labeled
  `heldOut: false`.
- The isolation guard checks direct imports and actual glob-loaded modules; its injected lazy-validator/JSON leak is visible to the graph traversal.

Not built: held-out Quests themselves, scoring, multi-run aggregation, real LLM
Agent integration, persistence. The harness accepts any `AgentPolicy`, so
connecting a real Agent is a policy that calls a model instead of applying a fixed
patch — no harness change required.
