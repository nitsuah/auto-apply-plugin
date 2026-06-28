/**
 * Screenshot capture spec — generates README gallery images.
 */

import { test, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, '../../dist');

let context;
let extensionId;

// ── Screenshot tests ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  const userDataDir = '/tmp/playwright-screenshot-profile-' + Math.random().toString(36).substring(7);
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  // Retry finding the service worker a few times
  for (let i = 0; i < 10; i++) {
      const workers = context.serviceWorkers();
      if (workers.length > 0) {
          extensionId = workers[0].url().split('/')[2];
          break;
      }
      await new Promise(r => setTimeout(r, 2000));
  }
  if (!extensionId) throw new Error('Service worker not found after retries');
});

test.afterAll(async () => {
  await context.close();
});

test('screenshot: main dashboard', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 420, height: 640 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  await page.screenshot({ path: 'screenshots/main-dashboard.png' });
});

test('screenshot: tracker workspace', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-tracker-btn');
  await btn.click();
  await page.waitForFunction(() => !document.getElementById('tracker-screen')?.classList.contains('hidden'), { timeout: 4000 });
  await page.screenshot({ path: 'screenshots/tracker-workspace.png' });
});

test('screenshot: profile and memory', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 860 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-profile-btn');
  await btn.click();
  await page.waitForFunction(() => !document.getElementById('setup-screen')?.classList.contains('hidden'), { timeout: 4000 });
  await page.screenshot({ path: 'screenshots/profile-memory.png' });
});

test('screenshot: job search panel', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-job-search-btn');
  await btn.click();
  await page.waitForFunction(() => !document.getElementById('job-search-screen')?.classList.contains('hidden'), { timeout: 4000 });
  await page.screenshot({ path: 'screenshots/job-search.png' });
});

test('screenshot: AI settings panel', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-ai-btn');
  await btn.click();
  await page.waitForFunction(() => !document.getElementById('ai-screen')?.classList.contains('hidden'), { timeout: 4000 });
  await page.screenshot({ path: 'screenshots/ai-settings.png' });
});
