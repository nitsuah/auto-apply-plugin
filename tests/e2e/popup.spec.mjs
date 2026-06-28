import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

import { installChromeMock } from './chrome-mock.js';

test('popup renders shell and primary workspace actions', async ({ page }) => {
  await page.addInitScript(installChromeMock);
  const popupUrl = pathToFileURL(path.resolve(process.cwd(), 'popup/popup.html')).toString();
  await page.goto(popupUrl);

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#header-job-search-btn')).toBeVisible();
  await expect(page.locator('#header-tracker-btn')).toBeVisible();
  await expect(page.locator('#header-ai-btn')).toBeVisible();
  await expect(page.locator('#header-help-btn')).toBeVisible();
});

test('setup profile workspace remains visible for first-load state', async ({ page }) => {
  await page.addInitScript(installChromeMock);
  const popupUrl = pathToFileURL(path.resolve(process.cwd(), 'popup/popup.html')).toString();
  await page.goto(popupUrl);

  await expect(page.locator('#setup-screen')).toHaveCount(1);
  await expect(page.locator('#profile-resume-section')).toHaveCount(1);
  await expect(page.locator('#profile-privacy-section')).toHaveCount(1);
});
