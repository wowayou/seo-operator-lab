import { chromium } from 'playwright-core';

/**
 * Calibrates the agent benchmark harness against the deterministic reference
 * policies.
 *
 * The point is not that a repair works -- browser-smoke.mjs already proves that
 * through the human UI. The point is that the harness produces *different*
 * records for repairs a chat transcript would describe identically: a narrow fix,
 * an overbroad fix that satisfies the symptom while breaking a regression, and an
 * upgrade-safe production fix.
 */

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true,
  args: ['--no-sandbox'],
});

const baseUrl = process.env.LAB_URL ?? 'http://127.0.0.1:5173';
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const CANONICAL = 'wp-canonical-duplicate-001';
const NOINDEX = 'wp-accidental-noindex-002';

/**
 * Each expectation encodes what the harness must be able to distinguish.
 * `regressionsIntroduced` is the measurement that separates a real fix from a
 * plausible-looking one.
 */
const expectations = [
  {
    questId: CANONICAL,
    policy: 'observeOnly',
    note: 'baseline: the authored fault is present before any repair',
    outcome: 'fail',
    targetPassed: false,
    regressionsIntroduced: 0,
  },
  {
    questId: CANONICAL,
    policy: 'canonicalLabRepair',
    note: 'narrow vendor edit passes and is reviewed as lab-grade',
    outcome: 'pass',
    targetPassed: true,
    regressionsIntroduced: 0,
    reviewLevel: 'lab',
  },
  {
    questId: CANONICAL,
    policy: 'canonicalProductionRepair',
    note: 'site-owned override passes and is reviewed as production-grade',
    outcome: 'pass',
    targetPassed: true,
    regressionsIntroduced: 0,
    reviewLevel: 'production',
  },
  {
    questId: CANONICAL,
    policy: 'canonicalOverbroadRepair',
    note: 'symptom gone but Product Schema destroyed: must not count as a pass',
    outcome: 'fail',
    targetPassed: true,
    regressionsIntroduced: 1,
  },
  {
    questId: NOINDEX,
    policy: 'noindexNarrowRepair',
    note: 'target indexable while the intentional control stays noindex',
    outcome: 'pass',
    targetPassed: true,
    regressionsIntroduced: 0,
  },
  {
    questId: NOINDEX,
    policy: 'noindexOverbroadRepair',
    note: 'removing every rule leaks the private control page',
    outcome: 'fail',
    targetPassed: true,
    regressionsIntroduced: 1,
  },
  {
    questId: NOINDEX,
    policy: 'escapeAttempt',
    note: 'the tool surface confines the agent to /wordpress',
    outcome: 'error',
  },
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const records = [];

try {
  await page.goto(`${baseUrl}/agent-run.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.agentRunReady === true, { timeout: 30_000 });

  for (const expectation of expectations) {
    const record = await page.evaluate(
      (options) => window.agentRun(options),
      { questId: expectation.questId, policy: expectation.policy },
    );

    check(
      record.outcome === expectation.outcome,
      `${expectation.policy}: expected outcome ${expectation.outcome}, got ${record.outcome} (${expectation.note})\n${JSON.stringify(record, null, 2)}`,
    );
    check(
      record.questId === expectation.questId,
      `${expectation.policy}: record was attributed to ${record.questId}`,
    );
    // Both current Quests are readable in the deployed bundle, so every record
    // they produce must be labeled open-book rather than silently comparable to
    // a held-out result.
    check(
      record.heldOut === false,
      `${expectation.policy}: a public Quest must be recorded as open-book, got heldOut=${record.heldOut}`,
    );

    if (expectation.outcome === 'error') {
      check(
        /outside \/wordpress/.test(record.error ?? ''),
        `${expectation.policy}: expected a path confinement error, got ${record.error}`,
      );
      const failedCall = record.toolCalls.find((call) => !call.ok);
      check(failedCall !== undefined, `${expectation.policy}: the blocked call was not recorded`);
      check(
        record.validationCount === 0,
        `${expectation.policy}: a blocked run must not produce a verdict`,
      );
    } else {
      const lastValidation = record.validations.at(-1);
      check(lastValidation !== undefined, `${expectation.policy}: no validation was recorded`);
      check(
        lastValidation.targetPassed === expectation.targetPassed,
        `${expectation.policy}: expected targetPassed ${expectation.targetPassed}, got ${lastValidation.targetPassed}`,
      );
      check(
        record.regressionsIntroduced === expectation.regressionsIntroduced,
        `${expectation.policy}: expected ${expectation.regressionsIntroduced} regression(s), got ${record.regressionsIntroduced}\n${JSON.stringify(lastValidation, null, 2)}`,
      );
      if (expectation.reviewLevel) {
        check(
          record.reviewLevel === expectation.reviewLevel,
          `${expectation.policy}: expected review level ${expectation.reviewLevel}, got ${record.reviewLevel}`,
        );
      }
      check(record.toolCallCount > 0, `${expectation.policy}: no tool calls were recorded`);
    }

    records.push({
      policy: expectation.policy,
      questId: record.questId,
      outcome: record.outcome,
      targetPassed: record.validations.at(-1)?.targetPassed ?? null,
      failedCheckIds: record.validations.at(-1)?.failedCheckIds ?? [],
      regressionsIntroduced: record.regressionsIntroduced,
      reviewLevel: record.reviewLevel ?? null,
      toolCallCount: record.toolCallCount,
      durationMs: record.durationMs,
    });
  }

  /**
   * The two overbroad repairs are the reason this harness exists: both make the
   * reported symptom disappear, so a symptom-only benchmark would score them as
   * successes.
   */
  const overbroad = records.filter((record) => record.policy.endsWith('OverbroadRepair'));
  check(overbroad.length === 2, 'Both overbroad reference policies must be exercised');
  check(
    overbroad.every((record) => record.targetPassed && record.outcome === 'fail'),
    `Overbroad repairs must be recorded as symptom-fixed but failed:\n${JSON.stringify(overbroad, null, 2)}`,
  );

  const reviewLevels = records
    .filter((record) => record.reviewLevel)
    .map((record) => record.reviewLevel);
  check(
    reviewLevels.includes('lab') && reviewLevels.includes('production'),
    `The harness must distinguish lab from production implementations: ${JSON.stringify(reviewLevels)}`,
  );

  /**
   * Held-out coverage, when the private checkout is present.
   *
   * The driver cannot name held-out reference policies -- they live in the private
   * repository and this script must keep working without it. So each held-out
   * Quest is exercised with `observeOnly`, which is generic: it fetches the target
   * and asks for a verdict without touching the runtime. That is enough to assert
   * the two things this repository is responsible for: the Quest boots through the
   * public harness, and its record is labeled `heldOut: true` so it is never
   * compared against an open-book number.
   *
   * A fresh fixture must FAIL, per the authoring contract in quest-authoring.md.
   */
  const heldOutIds = await page.evaluate(() => window.agentHeldOutQuestIds ?? []);
  const heldOutRecords = [];

  for (const questId of heldOutIds) {
    const record = await page.evaluate(
      (options) => window.agentRun(options),
      { questId, policy: 'observeOnly', disclosure: 'minimal' },
    );
    check(
      record.questId === questId,
      `held-out ${questId}: record was attributed to ${record.questId}`,
    );
    check(
      record.heldOut === true,
      `held-out ${questId}: must be recorded as held out, got heldOut=${record.heldOut}`,
    );
    check(
      record.outcome === 'fail',
      `held-out ${questId}: a fresh fixture must produce a deterministic FAIL, got ${record.outcome}`,
    );
    heldOutRecords.push({
      questId: record.questId,
      heldOut: record.heldOut,
      outcome: record.outcome,
      // Check ids are printed for public Quests but withheld here: this output is
      // pasted into issues and chat logs, and a held-out Quest's check ids name
      // its fault.
      failedCheckCount: record.validations.at(-1)?.failedCheckIds.length ?? 0,
    });
  }

  const unexpectedPageErrors = pageErrors.filter((message) => message !== 'Transition was skipped');
  check(
    unexpectedPageErrors.length === 0,
    `Unexpected page errors: ${JSON.stringify(unexpectedPageErrors)}`,
  );

  console.log(
    JSON.stringify(
      {
        agentRuns: records,
        heldOut: heldOutIds.length
          ? heldOutRecords
          : 'none present (private checkout absent; all numbers above are open-book)',
        pageErrors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
