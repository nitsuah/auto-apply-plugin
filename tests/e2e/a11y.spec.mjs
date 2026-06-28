/**
 * Accessibility tests with axe-core.
 */

import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, '../../dist');

let context;
let extensionId;

test.describe('Accessibility audit', () => {
  test.beforeEach(async () => {
    process.stdout.write('EXTENSION_PATH: ' + EXTENSION_PATH + '\n');
    process.stdout.write('Path exists: ' + fs.existsSync(EXTENSION_PATH) + '\n');
    const userDataDir = '/tmp/playwright-a11y-profile-' + Math.random().toString(36).substring(7);
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

    // Create a dummy page to be the "active" tab
    await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('main dashboard should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 420, height: 640 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('tracker workspace should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
    const btn = page.locator('#header-tracker-btn');
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('tracker-screen')?.classList.contains('hidden'), { timeout: 4000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('profile and memory screen should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 860 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
    const btn = page.locator('#header-profile-btn');
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('setup-screen')?.classList.contains('hidden'), { timeout: 4000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('job search panel should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
    const btn = page.locator('#header-job-search-btn');
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('job-search-screen')?.classList.contains('hidden'), { timeout: 4000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('AI settings panel should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 6000 });
    const btn = page.locator('#header-ai-btn');
    await btn.click();
    await page.waitForFunction(() => !document.getElementById('ai-screen')?.classList.contains('hidden'), { timeout: 4000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
