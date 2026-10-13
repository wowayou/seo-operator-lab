import { chromium } from 'playwright-core';

// Fast, network-independent shell checks. Real WordPress is covered separately.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? chromium.executablePath(), headless: true });
const baseUrl = process.env.LAB_URL ?? 'http://127.0.0.1:5173';
const errors = [], externalRequests = [];
const check = (value, message) => { if (!value) throw new Error(message); };
async function newPage({ storageBlocked = false, failFirstBoot = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  if (storageBlocked) await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  await page.route('**/src/runtime.ts*', (route) => route.fulfill({ contentType: 'application/javascript', body: `
    export class RuntimeSession {
      available = false; boots = 0;
      constructor(options) { this.options = options; }
      async boot() {
        this.available = false; this.options.replaceFrame(); this.options.onState('booting');
        await Promise.resolve(); ++this.boots;
        if (${failFirstBoot} && this.boots === 1) { this.options.onState('error'); this.options.onError('模拟离线：请点击重试启动', 'booting'); return false; }
        this.available = true; this.options.onState('ready'); return true;
      }
      async execute(operation) {
        this.options.onState(operation);
        await Promise.resolve();
        this.options.onState('ready');
        if (operation !== 'validating') return true;
        return { passed: false, targetPassed: false, checks: [{ id: 'escaped', name: 'Untrusted evidence', group: 'target', passed: false, expected: 'safe text', actual: '<img src=x onerror="window.injected=true">' }], details: '' };
      }
    }
  ` }));
  page.on('request', (request) => { if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url()); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  return page;
}
async function ready(page) { await page.locator('#validate:not([disabled])').waitFor(); }
async function toggle(page) { await page.locator('#toggle-mission-panel').click(); }
async function state(page) { return page.locator('.workspace').getAttribute('data-sidebar'); }

try {
  const page = await newPage();
  await ready(page);
  await page.locator('#start-guide').click();
  check(await page.locator('#quest-select').evaluate((node) => node.classList.contains('is-guided')), 'Guide does not point at the actual quest selector');
  for (let i = 0; i < 5; ++i) await page.locator('#guide-next').click();
  check(await page.locator('#operation-guide').isHidden(), 'Guide did not finish');
  check(await page.evaluate(() => localStorage.getItem('seo-operator-lab:guide-v1')) === 'seen', 'Guide completion was not saved');
  await page.locator('#open-guide').click();
  check(await page.locator('#operation-guide').isVisible(), 'Guide cannot be replayed');
  await page.keyboard.press('Escape');
  check(await page.locator('#open-guide').evaluate((node) => node === document.activeElement), 'Guide did not restore focus');

  const before = await page.locator('#runtime-canvas').boundingBox();
  const panel = await page.locator('#mission-panel').boundingBox();
  check(before.x + before.width <= panel.x, 'Inspector covers the runtime on desktop');
  const resizer = page.locator('#mission-resizer');
  const width = Number(await resizer.getAttribute('aria-valuenow'));
  await resizer.focus();
  await page.keyboard.press('ArrowLeft');
  check(Number(await resizer.getAttribute('aria-valuenow')) === width + 16, 'Keyboard resize failed');
  const handle = await resizer.boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x - 20, handle.y + 100);
  await page.mouse.up();
  check(Number(await resizer.getAttribute('aria-valuenow')) >= width + 30, 'Pointer resize failed');
  await toggle(page);
  const expandedCanvas = await page.locator('#runtime-canvas').boundingBox();
  check(expandedCanvas.width > before.width + 300, 'Collapsing the inspector does not release its space');
  check(await page.locator('#validate').isVisible() && await page.locator('#edit-plugin').isVisible(), 'Primary actions disappeared with the inspector');
  await page.keyboard.press('[');
  check(await state(page) === 'expanded', 'Panel shortcut failed');

  await page.locator('#mission-tab-overview').focus();
  await page.keyboard.press('ArrowRight');
  check(await page.locator('#mission-tab-results').getAttribute('aria-selected') === 'true', 'Tab arrow navigation failed');
  await page.keyboard.press('End');
  check(await page.locator('#mission-tab-hints').getAttribute('aria-selected') === 'true', 'Tab End navigation failed');
  await page.locator('#pin-mission-panel').click();
  await page.locator('#edit-plugin').click();
  check(await state(page) === 'expanded', 'Pinned panel collapsed while editing');
  await page.locator('#pin-mission-panel').click();
  await page.locator('#edit-plugin').click();
  check(await state(page) === 'collapsed', 'Automatic edit focus failed');
  await toggle(page);

  await page.locator('#toggle-runtime-fullscreen').click();
  await page.waitForFunction(() => document.querySelector('#app-shell').dataset.fullscreen !== 'false');
  check(await state(page) === 'collapsed', 'Fullscreen did not hide the panel');
  const full = await page.locator('#app-shell').boundingBox();
  check(Math.abs(full.width - 1440) < 2 && Math.abs(full.height - 900) < 2, 'Fullscreen dimensions incorrect');
  await page.locator('#toggle-runtime-fullscreen').click();
  await page.waitForFunction(() => document.querySelector('#app-shell').dataset.fullscreen === 'false');
  check(await state(page) === 'expanded', 'Exiting fullscreen did not restore the panel');
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }));
  await page.locator('#toggle-runtime-fullscreen').click();
  check(await page.locator('#app-shell').getAttribute('data-fullscreen') === 'fallback', 'Viewport fullscreen fallback missing');
  await page.keyboard.press('Escape');
  check(await page.locator('#app-shell').getAttribute('data-fullscreen') === 'false', 'Escape did not exit viewport fullscreen');
  await page.locator('#quest-select').focus();
  await page.keyboard.press('f');
  check(await page.locator('#app-shell').getAttribute('data-fullscreen') === 'false', 'Shortcut stole an input key');

  await page.locator('#validate').click();
  await page.locator('#validation-output[data-result="fail"]').waitFor();
  check(await page.locator('#validation-output img').count() === 0, 'Untrusted evidence was inserted as HTML');
  check((await page.locator('#validation-output').textContent()).includes('<img src=x'), 'Escaped evidence is missing');
  check(!(await page.evaluate(() => window.injected)), 'Evidence executed a script');
  await page.locator('#mission-tab-hints').click();
  await page.locator('#solution-guide summary').click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } }));
  await page.locator('#copy-solution').click();
  await page.locator('#copy-solution').click();
  await page.waitForFunction(() => document.querySelector('#copy-solution').getAttribute('aria-label') === '复制修改后代码');
  check(await page.locator('#copy-solution').getAttribute('data-copied') === null, 'Repeated copy left stale success feedback');
  await page.locator('#reset').click();
  await page.keyboard.press('f');
  check(await page.locator('#app-shell').getAttribute('data-fullscreen') === 'false', 'Shortcut fired during reset confirmation');
  await page.locator('#cancel-reset').click();

  for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1050, 700], [1440, 600]]) {
    await page.setViewportSize({ width, height });
    // Viewport emulation resolves before matchMedia's change event is necessarily
    // delivered. Wait for layout/event settlement before clicking the responsive UI.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (await state(page) === 'expanded') await toggle(page);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `Horizontal overflow at ${width}px`);
    for (const id of ['validate', 'edit-plugin', 'toggle-mission-panel', 'toggle-runtime-fullscreen', 'reset']) {
      const box = await page.locator(`#${id}`).boundingBox();
      check(box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${id} out of view at ${width}px`);
    }
    await toggle(page);
    if (width <= 1050) check(await page.locator('#runtime-canvas').evaluate((node) => node.inert), `Compact sheet should prevent interacting with covered content at ${width}px (${await state(page)})`);
    await page.locator('#close-mission-panel').click();
    check(!(await page.locator('#runtime-canvas').evaluate((node) => node.inert)), 'Runtime stayed inert after panel closed');
  }
  await page.close();

  const offline = await newPage({ storageBlocked: true, failFirstBoot: true });
  await offline.locator('#retry-runtime:not([hidden])').waitFor();
  check(await offline.locator('#runtime-error').isVisible(), 'Boot error is not actionable');
  await offline.locator('#retry-runtime').click();
  await ready(offline);
  check(await offline.locator('#boot-cover').isHidden(), 'Manual retry did not recover');
  await offline.locator('#open-guide').click();
  await offline.locator('#close-guide').click();
  await offline.close();
  check(errors.length === 0, `Unexpected shell errors: ${JSON.stringify(errors)}`);
  check(externalRequests.length === 0, `Shell checks allocated the real runtime: ${JSON.stringify(externalRequests)}`);
  console.log('PASS: shell controls, dock/auto-hide/pin/resize, native + fallback fullscreen, keyboard, guide replay, storage denied, boot recovery, escaped evidence, 320–1440px. No external runtime requests.');
} finally { await browser.close(); }
