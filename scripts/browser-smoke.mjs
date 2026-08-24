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
  await page.locator('#mission-tab-overview').click();
}

async function runValidation(outcome) {
  await page.locator('#validate').click();
  try {
    await page.locator(`#validation-output[data-result="${outcome}"]`).waitFor({ timeout: 30_000 });
  } catch (error) {
    const currentOutput = await page
      .locator('#validation-output')
      .innerText({ timeout: 1_000 })
      .catch(() => `Unavailable; page URL is ${page.url()}`);
    throw new Error(`${error.message}\nCurrent validation output:\n${currentOutput}`);
  }
  return page.locator('#validation-output').innerText();
}

async function revealAllHints() {
  await page.locator('#mission-tab-hints').click();
  while (!(await page.locator('#reveal-hint').isDisabled())) await page.locator('#reveal-hint').click();
  if ((await page.locator('#hint-list .hint-item').count()) !== 3) {
    throw new Error('The active Quest did not reveal exactly three progressive hints');
  }
}

async function verifyRuntimeFullscreen() {
  await page.keyboard.press('f');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#runtime-canvas');
    return canvas?.getAttribute('data-fullscreen') !== 'false';
  });

  const dimensions = await page.locator('#runtime-canvas').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  if (
    Math.abs(dimensions.width - dimensions.viewportWidth) > 2 ||
    Math.abs(dimensions.height - dimensions.viewportHeight) > 2
  ) {
    throw new Error(`Runtime did not fill the viewport: ${JSON.stringify(dimensions)}`);
  }

  await page.locator('#exit-runtime-fullscreen').click();
  await page.waitForFunction(
    () => document.querySelector('#runtime-canvas')?.getAttribute('data-fullscreen') === 'false',
  );
}

async function verifyWorkspaceShortcuts() {
  const inspectorToggle = page.locator('#toggle-mission-panel');
  if (!(await inspectorToggle.isVisible())) throw new Error('Inspector toggle is not visible in the top bar');

  await inspectorToggle.click();
  await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-sidebar') === 'collapsed');
  if ((await inspectorToggle.getAttribute('aria-expanded')) !== 'false') {
    throw new Error('Mission panel button did not publish its collapsed state');
  }

  await page.keyboard.press('[');
  await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-sidebar') === 'expanded');
  if ((await inspectorToggle.getAttribute('aria-expanded')) !== 'true') {
    throw new Error('Mission panel shortcut did not update the button state');
  }

  await inspectorToggle.click();
  await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-sidebar') === 'collapsed');
  await page.keyboard.press('[');
  await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-sidebar') === 'expanded');
}

async function verifyMissionInspector() {
  if ((await page.locator('.layout-option').count()) !== 0) {
    throw new Error('The workspace should use one opinionated inspector layout');
  }
  const resizer = page.locator('#mission-resizer');
  const initialInspectorWidth = await page.locator('.mission-panel').evaluate((element) => element.getBoundingClientRect().width);
  await resizer.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  const resizedInspectorWidth = await page.locator('.mission-panel').evaluate((element) => element.getBoundingClientRect().width);
  if (Math.abs(resizedInspectorWidth - initialInspectorWidth - 16) > 1) {
    throw new Error(`Focus inspector resize did not move by 16px: ${JSON.stringify({ initialInspectorWidth, resizedInspectorWidth })}`);
  }
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const focusResizerBounds = await resizer.boundingBox();
  if (!focusResizerBounds) throw new Error('Focus inspector resize handle is not visible');
  const focusResizerCenterX = focusResizerBounds.x + focusResizerBounds.width / 2;
  await page.mouse.move(focusResizerCenterX, focusResizerBounds.y + 120);
  await page.mouse.down();
  await page.mouse.move(focusResizerCenterX - 24, focusResizerBounds.y + 120);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const pointerResizedWidth = await page.locator('.mission-panel').evaluate((element) => element.getBoundingClientRect().width);
  if (Math.abs(pointerResizedWidth - initialInspectorWidth - 24) > 2) {
    throw new Error(`Pointer resize did not expand the focus inspector by 24px: ${JSON.stringify({ initialInspectorWidth, pointerResizedWidth })}`);
  }
  const storedInspectorWidth = await page.evaluate(() => window.localStorage.getItem('seo-operator-lab:mission-panel-width'));
  if (storedInspectorWidth !== String(Math.round(pointerResizedWidth))) {
    throw new Error(`Focus inspector width was not persisted: ${JSON.stringify({ pointerResizedWidth, storedInspectorWidth })}`);
  }
  const expandedRuntimeBounds = await page.locator('.runtime-pane').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  await page.locator('#toggle-mission-panel').click();
  await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-sidebar') === 'collapsed');
  const reopenButtonBounds = await page.locator('#toggle-mission-panel').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  if (reopenButtonBounds.width === 0 || reopenButtonBounds.height === 0 || reopenButtonBounds.y > 64) {
    throw new Error(`Focus inspector toggle is not visible in the top bar: ${JSON.stringify(reopenButtonBounds)}`);
  }
  const collapsedRuntimeBounds = await page.locator('.runtime-pane').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  for (const dimension of ['x', 'y', 'width', 'height']) {
    if (Math.abs(expandedRuntimeBounds[dimension] - collapsedRuntimeBounds[dimension]) > 1) {
      throw new Error(`Focus inspector changed runtime ${dimension}: ${JSON.stringify({ expandedRuntimeBounds, collapsedRuntimeBounds })}`);
    }
  }
  await page.locator('#toggle-mission-panel').click();
  await page.waitForFunction(() => document.querySelector('.workspace')?.getAttribute('data-sidebar') === 'expanded');
  await page.locator('#mission-tab-hints').click();
  if ((await page.locator('.workspace').getAttribute('data-mission-view')) !== 'hints') {
    throw new Error('Focus inspector did not switch to the hints view');
  }
  await page.locator('#mission-tab-overview').click();
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
  await verifyMissionInspector();
  await verifyWorkspaceShortcuts();
  await verifyRuntimeFullscreen();
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

  await page.locator('#mission-tab-overview').click();
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
