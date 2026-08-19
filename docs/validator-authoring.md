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

## Test matrix

At minimum, cover:

1. the deliberate broken fixture;
2. the intended narrow repair;
3. an overbroad repair that breaks a regression;
4. a non-200 or malformed response where relevant.

Keep the pure tests fast. Use the Playwright matrix for the real Playground integration and editor workflow.
