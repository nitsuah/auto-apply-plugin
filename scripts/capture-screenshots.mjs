import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXTENSION_PATH = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'screenshots');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

console.log('Loading extension from', EXTENSION_PATH);
console.log('Exists?', fs.existsSync(EXTENSION_PATH));
console.log('Manifest?', fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json')));

const context = await chromium.launchPersistentContext('', {
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ],
});

const backgroundPage = context.backgroundPages()[0];
if (!backgroundPage) {
  console.error('No background page found — extension failed to load.');
  process.exit(1);
}
const extensionId = backgroundPage.url().split('/')[2];
console.log('Extension ID:', extensionId);

// Create dummy active tab
await context.newPage();

async function capture(name, setup) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html?standalone=1`);
  await page.waitForSelector('.screen:not(.hidden)', { state: 'visible', timeout: 5000 }).catch(() => {});
  if (setup) await setup(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  console.log('OK', name);
  await page.close();
}

await capture('01-main-dashboard.png');
await capture('02-tracker-workspace.png', async (page) => {
  await page.locator('#header-tracker-btn').click().catch(() => {});
  await page.waitForTimeout(500);
});
await capture('03-profile-memory.png', async (page) => {
  await page.locator('#header-profile-btn').click().catch(() => {});
  await page.waitForTimeout(500);
});
await capture('04-ai-settings.png', async (page) => {
  await page.locator('#header-ai-btn').click().catch(() => {});
  await page.waitForTimeout(500);
});

await context.close();
console.log('Done.');
