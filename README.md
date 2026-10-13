# SEO Operator Lab - Phase B

This repository contains the WordPress-first Phase B implementation from the PRD. It keeps the proven Phase A Playground loop and adds two data-driven Quests:

- `wp-canonical-duplicate-001` — duplicate canonical with valid Product JSON-LD and homepage regressions;
- `wp-accidental-noindex-002` — an indexable target, a deliberately excluded (but publicly accessible) reference page, and another public page.

Both Quests include progressive hints, an opt-in exact-edit walkthrough, and a site-owned production repair exercise. **Noindex is not access control.** Do not put private information in the fixture.

Progress, accounts, scoring, persistence, export and LLM features are intentionally deferred. [The next Quest plan](docs/quest-scaling-analysis.md#next-quest-003--redirect-chain-planned-not-shipped) is a bounded redirect-chain exercise, not another published Quest yet.

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

Use Node.js 22.17+ (CI uses Node 22). The development server is for local use, not a production WordPress host.

```bash
npm ci
npm run dev
```

Open the printed local URL. The first Playground boot can take 30-90 seconds while WordPress is downloaded and initialized.

1. Choose **当前关卡** in the top bar. First-time visitors can choose **带我上手**; **操作指引** always replays the five-step walkthrough.
2. Click the persistent **① 运行验证** button. The initial FAIL is intentional; failed evidence opens automatically.
3. Use **③ 任务与提示 → 提示**. Progressive hints do not reveal everything at once. **照着操作** explicitly discloses the lab answer, with exact before/after code and the WordPress **Update File** save action. It never writes the answer for you.
4. **② 编辑代码** opens the correct file. The desktop inspector is docked, not laid over WordPress, and automatically collapses for editing. Pin it when you want to read and edit side by side. Compact screens use a dismissible sheet; fullscreen also collapses it. Core buttons stay visible in either mode.
5. Save in WordPress, then validate again. Symptom-only repairs fail when a regression is introduced. After PASS, read **实现复盘**; both Quests offer a confirmed reset into the Site Overrides exercise. In that exercise, the editor button continues opening Site Overrides.
6. Switching Quests, Reset and starting the production exercise confirm before discarding edits. Refreshing also loses this temporary runtime; an edit session requests the browser's unload warning. Startup is bounded to 180 seconds, operations to 30 seconds. No automatic retries occur; a timed-out operation keeps the editor visible for copying work before a confirmed reset.

`F` toggles fullscreen and `[` toggles the inspector in the **outer workspace**. These shortcuts do not intercept inputs, the nested WordPress editor, or confirmation dialogs. Browser fullscreen has a viewport-sized fallback. Panel width, pin preference and guide dismissal are optional local preferences, not learning-progress persistence.

### Safety and production boundaries

The outer page restricts scripts/frames with a Content Security Policy; the cross-origin iframe is sandboxed without top navigation or popups. WordPress/PHP remain pinned teaching fixtures. Do not use real credentials, mount secrets, or deploy their editable demo plugins to a real site. A `production` review only establishes the known fixture's vendor file is unchanged, the site override is active/changed, and its rule is effective; it does not certify caching, authorization, real search indexation or all production code.

The shell itself is indexable, with a canonical homepage, description, `robots.txt` and single-URL sitemap. The deliberate noindex fault exists only inside the lab. GitHub Pages cannot set arbitrary response security headers from this repository; the meta policy cannot provide `frame-ancestors`. The hosted Playground and its network availability remain external dependencies.

## Authoring a Quest

```bash
npm run quest:new -- broken-redirect "Broken Redirect"
```

The scaffold is created under `src/quests/wordpress/_drafts/` and is not loaded by the app until it is complete and moved into the formal Quest directory. See [docs/quest-authoring.md](docs/quest-authoring.md).

## Verify the project

```bash
npm run check          # TypeScript + Quest JSON + Blueprint validation
npm test               # validators, runtime lifecycle, disclosure and isolation guards
npm run build          # production build
npm audit
```

With the dev server running, the UI smoke tests layout, keyboard navigation, the guide, denied storage and recovery **without downloading WordPress**. The real browser smoke drives both documented lab repairs, both overbroad regressions, both production paths, Reset, switching and the 390px editor. The agent smoke calibrates eight deterministic reference policies:

```bash
npm run dev &
CHROME_PATH=/path/to/chrome npm run test:ui
CHROME_PATH=/path/to/chrome npm run test:browser
CHROME_PATH=/path/to/chrome npm run test:agent
```

`CHROME_PATH` may point at Chromium or Playwright's `chrome-headless-shell`. Without it, the installed Playwright Chromium path is used. `LAB_URL` overrides the default `http://127.0.0.1:5173`. The real browser matrix also works against a served `dist/` artifact. Current screenshots/reports go to gitignored `artifacts/current/` (`ARTIFACT_DIR` overrides it); historical screenshots are not overwritten.

The existing Pages workflow runs unit/isolation tests before building, pins its top-level actions, limits build/deploy duration and grants publish permissions only to the deploy job. It adds no schedules, matrices, browser downloads or automatic retry loops. This public repository uses standard GitHub-hosted runners (free compute under [GitHub's documented billing model](https://docs.github.com/en/billing/concepts/product-billing/github-actions)); the small Pages artifact keeps the upload action's one-day retention. Workflow execution itself is verified only when a publish is authorized.

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

## Support

If SEO Operator Lab has been useful to you,
you can [support my work here](https://eigentime.org/support?from=seo-operator-lab).

Support is entirely voluntary, provides no additional features or benefits, and does not affect free use of the project.

## License

Released under the [MIT License](LICENSE).
