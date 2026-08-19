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

### Next: Phase C

- Add the remaining three WordPress Quests through the scaffold.
- Standardize reusable evidence helpers for HTTP, HTML, robots, redirects, and structured data.
- Add a matrix test that discovers every formal Quest and asserts it has unit coverage and browser acceptance metadata.

### Later

- Phase D can consume the existing `id`, hints, attempts, and review interval fields without changing runtime validation.
- A future solution-review layer may classify update safety or blast radius, but it should never replace deterministic target/regression checks.

## Tradeoff

JSON plus small TypeScript modules is more verbose than one giant configuration file, but it keeps Blueprint code, learner copy, and Validator logic close to the Quest. That locality is valuable when a fixture breaks against a new WordPress version. The authoring validator and scaffold offset the repetition without hiding the runtime behavior behind a large framework.
