# SEO Operator Lab - Phase B

This repository contains the WordPress-first Phase B implementation from the PRD. It keeps the proven Phase A Playground loop and adds two data-driven Quests:

- `wp-canonical-duplicate-001` - Duplicate Canonical with Product Schema and homepage regressions;
- `wp-accidental-noindex-002` - an indexable target with an intentionally noindex control page.

Progress, accounts, scoring, persistence, export, LLM features, and the remaining three Quests are intentionally deferred.

## Live site

The `main` branch is deployed to GitHub Pages:

https://wowayou.github.io/seo-operator-lab/

The production build uses relative asset paths, so the same artifact can later
move to a custom domain without changing the Vite base path. After choosing a
domain, configure it under **Settings -> Pages -> Custom domain** and point the
domain's DNS record to GitHub Pages.

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

With the dev server running, the browser smoke drives both Quests, the WordPress Plugin File Editor, the production-grade Canonical path, Reset, Quest switching, and 390px layout:

```bash
CHROME_PATH=/path/to/chromium npm run test:browser
```

See [docs/architecture.md](docs/architecture.md), [docs/quest-authoring.md](docs/quest-authoring.md), [docs/validator-authoring.md](docs/validator-authoring.md), and [docs/quest-scaling-analysis.md](docs/quest-scaling-analysis.md) for the maintenance model and research notes. [docs/build-log.md](docs/build-log.md) records the observed Playground evidence.

## License

Released under the [MIT License](LICENSE).
