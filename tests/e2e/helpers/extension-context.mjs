import { chromium } from '@playwright/test';
import fs from 'node:fs';

/**
 * Launch a persistent Chromium context with the extension loaded.
 *
 * Why both `headless: true` AND `--headless=new`:
 *   Playwright 1.61 internally only pushes `--headless` (bare flag), which does
 *   not reliably trigger Chrome's extension service worker registration in CI.
 *   The explicit `--headless=new` in args is required to ensure the new headless
 *   mode that supports extension service workers.
 *
 * @param {string} extensionPath - Absolute path to the built extension dist dir.
 * @param {string} [profilePrefix] - Prefix for the temporary user data dir.
 * @returns {{ context: import('@playwright/test').BrowserContext, extensionId: string }}
 */
export async function launchExtensionContext(extensionPath, profilePrefix = 'playwright-ext') {
  if (!fs.existsSync(extensionPath)) {
    throw new Error(
      `Extension build not found at "${extensionPath}". Run npm run build first.`
    );
  }

  const userDataDir = `/tmp/${profilePrefix}-${Math.random().toString(36).slice(2)}`;
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--headless=new',
      '--enable-extensions',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  context.on('serviceworker', sw =>
    sw.on('console', msg => process.stdout.write(`[SW:${msg.type()}] ${msg.text()}\n`))
  );

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 45000 });

  const extensionId = sw.url().split('/')[2];
  if (!extensionId) {
    await context.close();
    throw new Error(`Service worker registered but extensionId could not be parsed from: ${sw.url()}`);
  }

  return { context, extensionId };
}
