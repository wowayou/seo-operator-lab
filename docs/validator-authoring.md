# Validator Authoring Guide

## Shape

Export a pure evaluator for unit tests and a small Playground adapter:

```ts
export function evaluateSomething(observation: Observation): ValidationResult;
export async function validate(client: PlaygroundClient): Promise<ValidationResult>;
```

The adapter should only collect runtime evidence. The evaluator should decide pass/fail.

## Check design

Every check has:

- a stable `id`;
- a user-readable name;
- `group: "target"` or `group: "regression"`;
- deterministic `expected` and `actual` values;
- an optional explanation for a surprising regression.

Use `targetPassed` to distinguish “the reported symptom is gone” from “the Quest is safe to complete.” The final result must require every regression check too.

Do not enforce a preferred source edit unless the Quest explicitly teaches a method and can observe its contract. Prefer behavior and side-effect checks. Put maintainability advice in `review`, not in the deterministic PASS gate.

Use `inspectHtml()` for non-executing, entity-aware HTML5 evidence rather than regex matching against arbitrary markup. Comments, scripts and templates are not rendered head declarations. An empty or malformed response must not pass just because a forbidden tag disappeared. The helper caps input at 2,000,000 characters; an over-limit response is an inspection error, not PASS.

For robots rules, combine every case-insensitive `X-Robots-Tag` header value with supported HTML directives, include `none`, and keep crawler scope meaningful. A Googlebot-only exclusion cannot replace a generic noindex control. For Product JSON-LD, require a parsed Product node, schema.org context and nonempty name; this deliberately does **not** claim full rich-results eligibility.

`observeOwnership()`/`implementationReview()` distinguish behaviorally passing lab edits from a runtime-proven site-owned path. Only collect this evidence after PASS. Vendor baseline equality, active/changed overrides and effective rules are necessary; a source-code substring or comment is not proof. Document that the review does not certify all production risks.

## Test matrix

At minimum, cover:

1. the deliberate broken fixture;
2. the intended narrow repair;
3. an overbroad repair that breaks a regression;
4. non-200, empty/malformed responses, duplicates and HTML lookalikes;
5. restrictive response headers and crawler-scope regressions for indexing tasks;
6. missing/inactive/ineffective ownership evidence must not earn a production label.

Keep the pure tests fast. Use the Playwright matrix for the real Playground integration and editor workflow.
