# SEO Operator Lab - Phase B

This repository contains the WordPress-first Phase B implementation from the PRD. It keeps the proven Phase A Playground loop and adds two data-driven Quests:

- `wp-canonical-duplicate-001` - Duplicate Canonical with Product Schema and homepage regressions;
- `wp-accidental-noindex-002` - an indexable target with an intentionally noindex control page.

Progress, accounts, scoring, persistence, export, LLM features, and the remaining three Quests are intentionally deferred.

## Live site

The `main` branch is deployed to GitHub Pages at https://seolab.eigentime.org/
(the default https://wowayou.github.io/seo-operator-lab/ still resolves).

The production build uses relative asset paths, so the same artifact works from
either origin without changing the Vite base path. The custom domain is stored in
the repository's Pages settings; because this project publishes from a workflow,
no `CNAME` file is committed. DNS is one `CNAME` record for `seolab` pointing at
`wowayou.github.io`, unproxied so GitHub issues the certificate.

## Local folder

The project is located at:

`/home/forbackup/Dev/my-projects/seo-operator-lab`

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. The first Playground boot can take 30-90 seconds while WordPress is downloaded and initialized.

1. Choose a Quest from **当前 Quest**.
2. Run the validator and inspect target versus regression evidence.
3. Reveal progressive hints only as needed, then edit the embedded WordPress runtime.
4. A target-only repair is shown as a regression failure when it removes required behavior.
5. After a complete PASS, read **实现复盘**. The Canonical Quest offers a reset-and-open path for the production-grade Site Overrides solution.
6. Quest switching and Reset both confirm before discarding the current runtime.

## Authoring a Quest

```bash
npm run quest:new -- broken-redirect "Broken Redirect"
```

The scaffold is created under `src/quests/wordpress/_drafts/` and is not loaded by the app until it is complete and moved into the formal Quest directory. See [docs/quest-authoring.md](docs/quest-authoring.md).

## Verify the project

```bash
npm run check          # TypeScript + Quest JSON + Blueprint validation
npm test               # pure Validator tests
npm run build          # production build
npm audit
```

With the dev server running, the browser smoke drives both Quests, the WordPress
Plugin File Editor, the production-grade Canonical path, Reset, Quest switching,
the workspace shortcuts, and 390px layout. The agent smoke calibrates the
benchmark harness against its deterministic reference policies:

```bash
npm run dev &                      # both suites need the dev server
CHROME_PATH=/path/to/chrome npm run test:browser
CHROME_PATH=/path/to/chrome npm run test:agent
```

`CHROME_PATH` may point at a full Chromium or at Playwright's
`chrome-headless-shell`; both suites run headless.

## Agent benchmark harness

`src/agent/` exposes the same runtime to a non-human operator: a disclosure-gated
brief, an instrumented tool surface over `PlaygroundClient`, and a run record. The
Quest Validator stays the only judge and is deliberately not a tool.

`agent-run.html` is the dev-only driver. Vite bundles only the root `index.html`,
so the harness and its reference policies never reach the published site.

Results from the two current Quests are **open-book**: the deployed bundle
contains the fault Blueprints and the Validator's check ids, so any Agent with web
access can read the answers. Every run record carries `heldOut`, which is `false`
for both of them.

The seam for a trustworthy held-out set is in place. `src/quests/heldout/` is
gitignored and expected to be a checkout of a separate **private** repository:

```bash
git clone <private-repo> src/quests/heldout   # never committed here
npm test                                      # isolation guards must stay green
```

When that directory is absent, the loader exports nothing and the project builds
and tests exactly as it does now. `src/agent/heldout-isolation.test.ts` walks the
import graph from `src/main.ts` and fails if the held-out loader ever becomes
reachable from the public bundle. Creating the private repository is a deliberate
human step — it decides what the benchmark measures. See
[docs/agent-benchmark.md](docs/agent-benchmark.md) for the measurements, the
disclosure levels, and the leakage threat model.

See [docs/architecture.md](docs/architecture.md), [docs/quest-authoring.md](docs/quest-authoring.md), [docs/validator-authoring.md](docs/validator-authoring.md), [docs/agent-benchmark.md](docs/agent-benchmark.md), and [docs/quest-scaling-analysis.md](docs/quest-scaling-analysis.md) for the maintenance model and research notes. [docs/build-log.md](docs/build-log.md) records the observed Playground evidence.

## License

Released under the [MIT License](LICENSE).
