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

// Stub chrome.runtime.sendMessage so the popup initialises without a live
// service worker. These tests exercise popup UI structure, not messaging.
const SW_STUB = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage = (_msg, callback) => {
      if (typeof callback === 'function') setTimeout(() => callback(null), 0);
    };
  }
};

test.describe('Accessibility audit', () => {
  test.beforeEach(async () => {
    process.stdout.write('EXTENSION_PATH: ' + EXTENSION_PATH + '\n');
    ({ context, extensionId } = await launchExtensionContext(EXTENSION_PATH, 'playwright-a11y-profile'));
    await context.addInitScript(SW_STUB);
    // Create a dummy page to be the "active" tab
    await context.newPage();
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('main dashboard should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 420, height: 640 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await expect(page.locator('.screen:not(.hidden)')).toBeVisible({ timeout: 30000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('tracker workspace should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await expect(page.locator('.screen:not(.hidden)')).toBeVisible({ timeout: 30000 });
    await page.locator('#header-tracker-btn').click();
    await expect(page.locator('#tracker-screen')).toBeVisible({ timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('profile and memory screen should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 860 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await expect(page.locator('.screen:not(.hidden)')).toBeVisible({ timeout: 30000 });
    await page.locator('#header-profile-btn').click();
    await expect(page.locator('#setup-screen')).toBeVisible({ timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('job search panel should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await expect(page.locator('.screen:not(.hidden)')).toBeVisible({ timeout: 30000 });
    await page.locator('#header-job-search-btn').click();
    await expect(page.locator('#job-search-screen')).toBeVisible({ timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('AI settings panel should not have any automatically detectable accessibility issues', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
    await expect(page.locator('.screen:not(.hidden)')).toBeVisible({ timeout: 30000 });
    await page.locator('#header-ai-btn').click();
    await expect(page.locator('#ai-screen')).toBeVisible({ timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
