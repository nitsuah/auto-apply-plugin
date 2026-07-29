/**
 * Accessibility tests with axe-core.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { launchExtensionContext } from './helpers/extension-context.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, '../../dist');

let context;
let extensionId;

test.describe('Accessibility audit', () => {
  test.beforeEach(async () => {
    process.stdout.write('EXTENSION_PATH: ' + EXTENSION_PATH + '\n');
    ({ context, extensionId } = await launchExtensionContext(EXTENSION_PATH, 'playwright-a11y-profile'));
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
