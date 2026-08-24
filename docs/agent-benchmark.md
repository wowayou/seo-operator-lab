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

Paths are confined to `/wordpress` by `assertAllowedPath()`. That confinement
keeps runs comparable — an Agent cannot reach PHP internals or the harness — but
it is **not** the leakage defense. The lab's own source is not in that filesystem
at all.

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

`postPassReview` is withheld at every level, because it names the exact
production fix.

## Calibration

`npm run test:agent` runs seven deterministic reference policies. They are
fixtures, not Agents under test. They exist to prove the harness distinguishes
outcomes that a transcript would describe identically:

| Policy | Expected |
| --- | --- |
| `observeOnly` | `fail`, target not passed — the authored fault is present |
| `canonicalLabRepair` | `pass`, review `lab` |
| `canonicalProductionRepair` | `pass`, review `production` |
| `canonicalOverbroadRepair` | `fail`, `targetPassed: true`, 1 regression |
| `noindexNarrowRepair` | `pass` |
| `noindexOverbroadRepair` | `fail`, `targetPassed: true`, 1 regression |
| `escapeAttempt` | `error`, no verdict produced |

The two overbroad policies are the reason the harness exists. Both make the
reported symptom disappear, so a symptom-only benchmark would score them as
successes. If those two ever report `pass`, the harness is broken regardless of
what any Agent scores.

## Threat model: task leakage

This is the unsolved problem, and it is worse than "the repository is public".

**Observed.** The production bundle at `dist/assets/index-*.js` contains the
fault-injection Blueprint source and the Validator's check ids
(`product-schema-preserved`, `private-reference`). Blueprints and validators are
imported by the app, so they are compiled into the artifact served to every
visitor. Making the repository private would not change this.

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

That test was itself verified by injecting four leak shapes — a side-effect
import, a `from` import, a dynamic `import()`, and a widened registry glob — and
confirming each one turns it red. Its first implementation missed all four: the
extractor required a `from` clause, so `import './x';` was invisible to it. A
leak test that cannot fail is worse than no test, because it manufactures
confidence. The extractor now enumerates import shapes explicitly and has a
self-check asserting it finds each one.

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

A held-out Quest should not reuse a public fault type. `src/quests/http.ts`
exists for that reason: it supplies redirect and header evidence helpers, since
`PlaygroundClient.request()` returns raw headers and does not follow redirects,
and no public Quest exercises that shape.

## Status

Verified by execution, not by inspection:

- The loop boots, reads, writes, and validates programmatically in a headless
  browser (`chrome-headless-shell`), and the seven reference policies produce the
  seven distinct records above.
- Both overbroad repairs record `targetPassed: true` with `outcome: fail` — the
  distinction the harness exists to make.
- The held-out seam degrades correctly when the private checkout is absent: the
  agent smoke reports `heldOut: "none present"` and every run is labeled
  `heldOut: false`.
- The isolation test catches all four leak shapes it claims to catch, confirmed by
  injecting each one.

Not built: held-out Quests themselves, scoring, multi-run aggregation, real LLM
Agent integration, persistence. The harness accepts any `AgentPolicy`, so
connecting a real Agent is a policy that calls a model instead of applying a fixed
patch — no harness change required.
