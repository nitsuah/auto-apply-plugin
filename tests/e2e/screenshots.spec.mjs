/**
 * Screenshot capture spec — generates README gallery images.
 */

import { test, chromium } from '@playwright/test';
import path from 'node:path';

const EXTENSION_PATH = path.join(__dirname, '../../dist');

let context;
let extensionId;

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  const backgroundPage = context.backgroundPages()[0];
  extensionId = backgroundPage.url().split('/')[2];

  // Create a dummy page to be the "active" tab
  await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

// ── Screenshot tests ──────────────────────────────────────────────────────────

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
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('tracker-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.screenshot({ path: 'screenshots/tracker-workspace.png' });
});

test('screenshot: profile and memory', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 860 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-profile-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('setup-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.screenshot({ path: 'screenshots/profile-memory.png' });
});

test('screenshot: job search panel', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-job-search-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('job-search-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.screenshot({ path: 'screenshots/job-search.png' });
});

test('screenshot: AI settings panel', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
  const btn = page.locator('#header-ai-btn');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('ai-screen')?.classList.contains('hidden'), { timeout: 4000 }).catch(() => {});
  }
  await page.screenshot({ path: 'screenshots/ai-settings.png' });
});
