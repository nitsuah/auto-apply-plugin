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
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--disable-gpu', // Disable GPU hardware acceleration
      '--disable-software-rasterizer', // Disable software rasterizer
      '--no-sandbox', // Required for Docker environments
      '--disable-setuid-sandbox', // Required for Docker environments
      '--disable-dev-shm-usage', // Overcomes limited resource problems
    ],
  });

  let extensionId;
  // Retry finding the service worker a few times
  for (let i = 0; i < 20; i++) {
      const workers = context.serviceWorkers();
      if (workers.length > 0) {
          extensionId = workers[0].url().split('/')[2];
          break;
      }
      await new Promise(r => setTimeout(r, 5000));
  }

  expect(extensionId).toBeDefined();
  expect(extensionId).not.toBeNull();
  expect(extensionId.length).toBeGreaterThan(0);

  // Close context after test
  await context.close();
});
