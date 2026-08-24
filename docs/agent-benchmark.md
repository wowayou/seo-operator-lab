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

Until a held-out set exists, every number this harness produces is open-book. The
harness records `disclosure` per run, but there is no field asserting the Quest
was unseen, because at present none are.

## Status

Verified: the loop boots, reads, writes, and validates programmatically in a
headless browser, and the reference policies produce the seven distinct records
above.

Not built: held-out Quests, scoring, multi-run aggregation, real LLM Agent
integration, persistence. The harness accepts any `AgentPolicy`, so connecting a
real Agent is a policy that calls a model instead of applying a fixed patch — no
harness change required.
