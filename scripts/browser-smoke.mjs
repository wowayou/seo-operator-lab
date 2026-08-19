import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    '/home/forbackup/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  headless: true,
  args: ['--no-sandbox'],
});

const baseUrl = process.env.LAB_URL ?? process.env.SPIKE_URL ?? 'http://127.0.0.1:5173';
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  requestFailures.push(`${request.url()} :: ${request.failure()?.errorText ?? 'unknown error'}`);
});

async function waitForRuntimeReady() {
  await page.locator('#runtime-status[data-state="ready"]').waitFor({ timeout: 180_000 });
}

function getRuntimeFrame() {
  const frame = page.frames().find((candidate) => candidate.url().includes('/scope:'));
  if (!frame) {
    throw new Error(`Playground runtime frame was not found: ${page.frames().map((item) => item.url()).join(', ')}`);
  }
  return frame;
}

async function editOpenPlugin(transform, expectedChange) {
  await page.waitForTimeout(1_000);
  const frame = getRuntimeFrame();
  await frame.getByRole('button', { name: 'I understand' }).click({ timeout: 30_000 });
  const editor = frame.locator('textarea[name="newcontent"]');
  await editor.waitFor({ state: 'attached', timeout: 30_000 });
  const code = await editor.inputValue();
  const repairedCode = transform(code);
  if (repairedCode === code) throw new Error(`Expected editor change was not found: ${expectedChange}`);
  await editor.evaluate((element, value) => {
    const textarea = element;
    const codeMirror = textarea.nextElementSibling?.CodeMirror;
    if (codeMirror) codeMirror.setValue(value);
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }, repairedCode);
  await frame.locator('#submit').click();
  await frame.locator('.updated, .notice-success').first().waitFor({ timeout: 30_000 });
}

async function runValidation(outcome) {
  await page.locator('#validate').click();
  try {
    await page.locator(`#validation-output[data-result="${outcome}"]`).waitFor({ timeout: 30_000 });
  } catch (error) {
    throw new Error(`${error.message}\nCurrent validation output:\n${await page.locator('#validation-output').innerText()}`);
  }
  return page.locator('#validation-output').innerText();
}

async function revealAllHints() {
  while (!(await page.locator('#reveal-hint').isDisabled())) await page.locator('#reveal-hint').click();
  if ((await page.locator('#hint-list .hint-item').count()) !== 3) {
    throw new Error('The active Quest did not reveal exactly three progressive hints');
  }
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await waitForRuntimeReady();
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          status: await page.locator('#runtime-status').innerText(),
          output: await page.locator('#validation-output').innerText(),
          consoleErrors,
          pageErrors,
          requestFailures,
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: 'artifacts/phase-b-boot-failure.png', fullPage: true });
    throw error;
  }

  if ((await page.locator('#quest-select option').count()) !== 2) throw new Error('Quest registry did not expose two Quests');
  await page.screenshot({ path: 'artifacts/phase-b-canonical-ready.png' });

  const canonicalInitial = await runValidation('fail');
  const canonicalCount = await page
    .locator('[data-check-id="canonical-count"] [data-value="actual"]')
    .textContent();
  const schemaInitiallyPreserved = await page
    .locator('[data-check-id="product-schema-preserved"]')
    .getAttribute('data-passed');
  if (canonicalCount !== '2' || schemaInitiallyPreserved !== 'true') {
    throw new Error(`Canonical initial state is incorrect:\n${canonicalInitial}`);
  }
  const canonicalEvidenceRow = page.locator('[data-check-id="canonical-count"]');
  await canonicalEvidenceRow.locator('.check-copy').click();
  if ((await canonicalEvidenceRow.locator('details[open]').count()) !== 1) {
    throw new Error('Validation evidence did not open when clicking the check row');
  }
  await canonicalEvidenceRow.locator('.check-copy').click();
  await page.screenshot({ path: 'artifacts/phase-b-canonical-fail.png' });

  await revealAllHints();
  await page.locator('#hint-open-editor').click();
  await editOpenPlugin(
    (code) =>
      code.replace(
        /\s*echo '<link rel="canonical" href="https:\/\/example\.test\/legacy-product\/" data-seo-spike="duplicate">';/,
        '',
      ),
    'duplicate canonical output',
  );

  const canonicalLabPass = await runValidation('pass');
  await page.locator('#success-toast[data-visible="true"]').waitFor();
  await page.locator('#review-badge[data-level="lab"]').waitFor();
  await page.locator('#advanced-challenge:not([hidden])').waitFor();
  if ((await page.locator('#advanced-steps li').count()) !== 4) {
    throw new Error('Production challenge did not render actionable steps');
  }
  if (!(await page.locator('#advanced-instruction').textContent())?.includes('remove_action')) {
    throw new Error('Production challenge did not render the exact repair snippet');
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/phase-b-canonical-lab-pass.png' });

  await page.locator('#start-advanced').click();
  await page.locator('#reset-dialog[open]').waitFor();
  await page.locator('#confirm-reset').click();
  await waitForRuntimeReady();
  await page.locator('#advanced-active:not([hidden])').waitFor();

  const canonicalAdvancedReset = await runValidation('fail');
  const resetCanonicalCount = await page
    .locator('[data-check-id="canonical-count"] [data-value="actual"]')
    .textContent();
  if (resetCanonicalCount !== '2') {
    throw new Error(`Advanced challenge did not reset the Canonical fault:\n${canonicalAdvancedReset}`);
  }

  await editOpenPlugin(
    (code) =>
      code.replace(
        '    // Add site-owned hook overrides here.',
        "    remove_action('wp_head', 'seo_lab_product_suite_duplicate_canonical', 20);",
      ),
    'site-owned remove_action override',
  );
  const canonicalProductionPass = await runValidation('pass');
  await page.locator('#review-badge[data-level="production"]').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/phase-b-canonical-production-pass.png' });

  await page.locator('#quest-select').selectOption('wp-accidental-noindex-002');
  await page.locator('#reset-dialog[open]').waitFor();
  await page.locator('#confirm-reset').click();
  await page.locator('#challenge-heading').getByText('误加的 Noindex', { exact: true }).waitFor();
  await waitForRuntimeReady();

  const noindexInitial = await runValidation('fail');
  const targetRobots = await page
    .locator('[data-check-id="target-indexable"] [data-value="actual"]')
    .textContent();
  const controlInitiallyProtected = await page
    .locator('[data-check-id="control-noindex-preserved"]')
    .getAttribute('data-passed');
  if (!targetRobots?.includes('noindex') || controlInitiallyProtected !== 'true') {
    throw new Error(`Noindex initial state is incorrect:\n${noindexInitial}`);
  }
  await page.screenshot({ path: 'artifacts/phase-b-noindex-fail.png' });

  await revealAllHints();
  await page.locator('#hint-open-editor').click();
  await editOpenPlugin(
    (code) => code.replace("is_page('field-notes') || ", ''),
    'field-notes noindex condition',
  );
  const noindexPass = await runValidation('pass');
  const controlAfterRepair = await page
    .locator('[data-check-id="control-noindex-preserved"]')
    .getAttribute('data-passed');
  if (controlAfterRepair !== 'true') throw new Error(`Noindex control page regressed:\n${noindexPass}`);
  await page.locator('#success-toast[data-visible="true"]').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/phase-b-noindex-pass.png' });

  await page.locator('#success-reset').click();
  await page.locator('#reset-dialog[open]').waitFor();
  await page.locator('#confirm-reset').click();
  await waitForRuntimeReady();
  const noindexReset = await runValidation('fail');
  const resetRobots = await page
    .locator('[data-check-id="target-indexable"] [data-value="actual"]')
    .textContent();
  if (!resetRobots?.includes('noindex')) throw new Error(`Noindex Reset did not restore the fault:\n${noindexReset}`);

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (hasHorizontalOverflow) throw new Error('Phase B UI has horizontal overflow at 390px');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#view-target').click();
  await page.waitForTimeout(1_000);
  const runtimeTop = await page.locator('.runtime-pane').evaluate((element) => element.getBoundingClientRect().top);
  if (runtimeTop > 160) throw new Error(`Mobile runtime navigation did not scroll into view: ${runtimeTop}`);
  await page.screenshot({ path: 'artifacts/phase-b-mobile.png', fullPage: true });

  const unexpectedPageErrors = pageErrors.filter((message) => message !== 'Transition was skipped');
  if (consoleErrors.length || unexpectedPageErrors.length) {
    throw new Error(`Unexpected browser errors: ${JSON.stringify({ consoleErrors, unexpectedPageErrors })}`);
  }

  console.log(
    JSON.stringify(
      {
        canonicalInitial,
        canonicalLabPass,
        canonicalAdvancedReset,
        canonicalProductionPass,
        noindexInitial,
        noindexPass,
        noindexReset,
        consoleErrors,
        pageErrors,
        requestFailures,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
