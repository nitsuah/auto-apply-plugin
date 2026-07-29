import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, '../../dist');

test('extension service worker loads successfully', async ({ page }) => {
  process.stdout.write('EXTENSION_PATH: ' + EXTENSION_PATH + '\n');
  process.stdout.write('Path exists: ' + fs.existsSync(EXTENSION_PATH) + '\n');

  const userDataDir = '/tmp/playwright-extension-profile-' + Math.random().toString(36).substring(7);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--enable-extensions',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  // Log SW console messages for CI debugging
  context.on('serviceworker', sw => {
    sw.on('console', msg => process.stdout.write(`[SW:${msg.type()}] ${msg.text()}\n`));
    sw.on('close', () => process.stdout.write('[SW] Service worker closed\n'));
  });

  // Log any error events
  context.on('error', err => process.stdout.write(`[Context Error] ${err}\n`));

  // Use event-driven detection with fallback for already-registered workers
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const extensionId = sw.url().split('/')[2];

  expect(extensionId).toBeDefined();
  expect(extensionId).not.toBeNull();
  expect(extensionId.length).toBeGreaterThan(0);

  // Close context after test
  await context.close();
});
