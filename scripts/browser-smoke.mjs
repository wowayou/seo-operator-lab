import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? chromium.executablePath(), headless: true });
const baseUrl = process.env.LAB_URL ?? 'http://127.0.0.1:5173';
const artifactDir = process.env.ARTIFACT_DIR ?? 'artifacts/current';
await mkdir(artifactDir, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(30_000);
const consoleErrors = [], pageErrors = [], requestFailures = [], records = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => requestFailures.push(`${request.url()} :: ${request.failure()?.errorText}`));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const metadata = {};
for (const slug of ['canonical-duplicate-001', 'accidental-noindex-002']) {
  const data = JSON.parse(await readFile(`src/quests/wordpress/${slug}/quest.json`, 'utf8'));
  metadata[data.id] = data;
}

async function ready() {
  await page.locator('#validate:not([disabled])').waitFor({ timeout: 190_000 });
  check(await page.locator('#boot-cover').isHidden(), `Boot cover remains visible: ${await page.locator('#runtime-status').textContent()}`);
}
async function openPanel(view = 'overview') {
  if (await page.locator('.workspace').getAttribute('data-sidebar') === 'collapsed') await page.locator('#toggle-mission-panel').click();
  await page.locator(`#mission-tab-${view}`).click();
}
async function validate(outcome, targetPassed = outcome === 'pass') {
  await page.locator('#validate').click();
  await page.locator(`#validation-output[data-result="${outcome}"]`).waitFor();
  const targets = await page.locator('[data-check-group="target"][data-passed="false"]').count();
  check((targets === 0) === targetPassed, `Unexpected target verdict:\n${await page.locator('#validation-output').innerText()}`);
  const text = await page.locator('#validation-output').innerText();
  records.push({ quest: await page.locator('#quest-select').inputValue(), outcome, targetPassed, text });
  return text;
}
async function openEditor(button = '#edit-plugin') {
  // goTo() can resolve before the nested document commits. Never type into the
  // previous editor while a same-URL navigation is still replacing it.
  const navigation = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame.url().includes('/scope:') && frame.url().includes('plugin-editor.php'),
  });
  await page.locator(button).click();
  await navigation;
  await ready();
}
async function editorFrame() {
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    const frame = page.frames().find((candidate) => candidate.url().includes('/scope:') && candidate.url().includes('plugin-editor.php'));
    if (frame) {
      await frame.locator('textarea[name="newcontent"]').waitFor({ state: 'attached' });
      const warning = frame.getByRole('button', { name: 'I understand', exact: true });
      if (await warning.isVisible()) await warning.click();
      return frame;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Editor frame not found: ${page.frames().map((frame) => frame.url()).join(', ')}`);
}
async function edit(transform) {
  const frame = await editorFrame();
  const editor = frame.locator('textarea[name="newcontent"]');
  const before = await editor.inputValue();
  const after = transform(before);
  check(after !== before, 'The documented edit did not change the open file');
  await editor.evaluate((textarea, code) => {
    textarea.nextElementSibling?.CodeMirror?.setValue(code);
    textarea.value = code;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }, after);
  const response = page.waitForResponse((response) => response.url().includes('/wp-admin/admin-ajax.php') && (response.request().postData() ?? '').includes('action=edit-theme-plugin-file'));
  await frame.locator('#submit').click();
  const saved = await response;
  const payload = await saved.json();
  check(saved.status() === 200 && payload.success === true, `WordPress did not save the file: ${JSON.stringify(payload)}`);
  await frame.locator('.updated, .notice-success').first().waitFor();
  return { before, after };
}
function replace(source, before, after) {
  check(source.includes(before), `Documented snippet not found: ${before}`);
  return source.replace(before, after);
}
async function hints(quest) {
  await openPanel('hints');
  while (!(await page.locator('#reveal-hint').isDisabled())) await page.locator('#reveal-hint').click();
  check(await page.locator('#hint-list .hint-item').count() === 3, 'Expected three hints');
  await page.locator('#solution-guide summary').click();
  check(await page.locator('#solution-before').textContent() === quest.walkthrough.before, 'Wrong before snippet');
  check(await page.locator('#solution-after').textContent() === quest.walkthrough.after, 'Wrong after snippet');
  check((await page.locator('#solution-steps').textContent()).includes('Update File'), 'Save button is not named in the walkthrough');
  await openEditor('#solution-open-editor');
  check(await page.locator('.workspace').getAttribute('data-sidebar') === 'collapsed', 'Editor should automatically collapse the inspector');
  await ready();
}
async function confirmRebuild() {
  await page.locator('#reset-dialog[open]').waitFor();
  const advanced = (await page.locator('#rebuild-dialog-title').textContent()).includes('站点自有');
  await page.locator('#confirm-reset').click();
  await ready();
  if (advanced) {
    check((await page.locator('#edit-plugin').getAttribute('title')).includes('seo-lab-site-overrides'), 'Production editor tooltip still points at the vendor file');
    check((await page.locator('#editor-location').textContent()).includes('seo-lab-site-overrides'), 'Production editor directions are stale');
  }
}
async function screenshot(name) { await page.screenshot({ path: `${artifactDir}/${name}.png` }); }

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await ready();
  if (await page.locator('#welcome-guide').isVisible()) await page.locator('#dismiss-welcome').click();
  check(await page.locator('#quest-select option').count() === Object.keys(metadata).length, 'Browser matrix must cover all formal Quests');
  const sandbox = await page.locator('#wp-playground').getAttribute('sandbox');
  check(sandbox?.includes('allow-scripts') && !sandbox.includes('allow-top-navigation') && !sandbox.includes('allow-popups'), 'Runtime sandbox is missing or overprivileged');

  const canonical = metadata['wp-canonical-duplicate-001'];
  await validate('fail');
  check(await page.locator('[data-check-id="canonical-count"] [data-value="actual"]').textContent() === '2', 'Expected duplicate canonicals');
  check(await page.locator('[data-check-group="regression"][data-passed="false"]').count() === 0, `Baseline has an unintended regression:\n${await page.locator('#validation-output').innerText()}`);
  const evidence = page.locator('[data-check-id="canonical-count"] details');
  check(await evidence.getAttribute('open') !== null, 'Failed evidence should be expanded for beginners');
  await evidence.locator('summary').click();
  check(await evidence.getAttribute('open') === null, 'Evidence cannot be collapsed');
  await evidence.locator('summary').click();
  await screenshot('canonical-fail');
  await hints(canonical);
  const canonicalLab = await edit((code) => replace(code, canonical.walkthrough.before, canonical.walkthrough.after));
  await validate('pass');
  await page.locator('#review-badge[data-level="lab"]').waitFor();
  await screenshot('canonical-lab-pass');

  // Broad workaround: remove the useful schema too, then prove the regression gate.
  await openEditor();
  await edit((code) => replace(code, "add_action('wp_head', 'seo_lab_product_suite_schema', 30);", '// overbroad repair'));
  await validate('fail', true);
  check(await page.locator('[data-check-id="product-schema-preserved"]').getAttribute('data-passed') === 'false', 'Missing schema did not fail');
  await openEditor();
  await edit(() => canonicalLab.after);
  await validate('pass');
  await page.locator('#start-advanced').click();
  await confirmRebuild();
  await validate('fail');
  await openEditor();
  await edit((code) => replace(code, '    // Add site-owned hook overrides here.', `    ${canonical.postPassReview.advancedChallenge.instruction}`));
  await validate('pass');
  await page.locator('#review-badge[data-level="production"]').waitFor();
  await screenshot('canonical-production-pass');

  // Cancellation must neither discard the runtime nor change the selected Quest.
  await page.locator('#quest-select').selectOption('wp-accidental-noindex-002');
  await page.locator('#cancel-reset').click();
  check(await page.locator('#quest-select').inputValue() === canonical.id, 'Cancelled switch changed the selected Quest');
  await validate('pass');
  await page.locator('#quest-select').selectOption('wp-accidental-noindex-002');
  await confirmRebuild();
  const noindex = metadata['wp-accidental-noindex-002'];
  await validate('fail');
  check(await page.locator('[data-check-group="regression"][data-passed="false"]').count() === 0, 'Noindex baseline controls are broken');
  await screenshot('noindex-fail');
  await hints(noindex);
  const noindexLab = await edit((code) => replace(code, noindex.walkthrough.before, noindex.walkthrough.after));
  await validate('pass');
  await page.locator('#review-badge[data-level="lab"]').waitFor();
  await screenshot('noindex-lab-pass');
  await openEditor();
  await edit((code) => replace(code, "add_action('wp_head', 'seo_lab_robots_rules_output', 20);", '// overbroad removal'));
  await validate('fail', true);
  check(await page.locator('[data-check-id="control-noindex-preserved"]').getAttribute('data-passed') === 'false', 'Blanket noindex removal passed');
  await openEditor();
  await edit(() => noindexLab.after);
  await validate('pass');
  await page.locator('#start-advanced').click();
  await confirmRebuild();
  await validate('fail');
  await openEditor();
  await edit((code) => replace(code, '    // Add site-owned hook overrides here.', `    ${noindex.postPassReview.advancedChallenge.instruction}`));
  await validate('pass');
  await page.locator('#review-badge[data-level="production"]').waitFor();
  await screenshot('noindex-production-pass');
  await page.locator('#reset').click();
  await confirmRebuild();
  await validate('fail');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#view-target').click();
  await ready();
  const mobile = await page.locator('#runtime-canvas').evaluate((node) => ({ height: node.clientHeight, width: node.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth }));
  check(!mobile.overflow && mobile.width <= 390 && mobile.height > 300, `Unusable mobile canvas: ${JSON.stringify(mobile)}`);
  await screenshot('mobile-runtime');
  await openEditor();
  await editorFrame();
  check(await page.locator('#validate').isVisible(), 'Validation button disappeared while editing on mobile');
  await openPanel('hints');
  if (!(await page.locator('#solution-guide').evaluate((node) => node.open))) await page.locator('#solution-guide summary').click();
  await screenshot('mobile-guide');

  const unexpected = pageErrors.filter((message) => message !== 'Transition was skipped');
  check(consoleErrors.length === 0 && unexpected.length === 0, `Unexpected errors: ${JSON.stringify({ consoleErrors, unexpected })}`);
  await writeFile(`${artifactDir}/browser-report.json`, JSON.stringify({ passed: true, records, consoleErrors, pageErrors, requestFailures }, null, 2));
  console.log(`PASS: both Quests — baseline FAIL, documented lab PASS, overbroad regression FAIL, production PASS, reset FAIL. Desktop + 390px. Artifacts: ${artifactDir}`);
} catch (error) {
  await screenshot('browser-failure').catch(() => {});
  await writeFile(`${artifactDir}/browser-failure.json`, JSON.stringify({ message: error.message, status: await page.locator('#runtime-status').textContent().catch(() => ''), records, consoleErrors, pageErrors, requestFailures }, null, 2));
  throw error;
} finally {
  await browser.close();
}
