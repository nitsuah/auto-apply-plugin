import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchExtensionContext } from './helpers/extension-context.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, '../../dist');

test('extension service worker loads successfully', async () => {
  process.stdout.write('EXTENSION_PATH: ' + EXTENSION_PATH + '\n');

  const { context, extensionId } = await launchExtensionContext(EXTENSION_PATH, 'playwright-extension-profile');

  expect(extensionId).toBeDefined();
  expect(extensionId).not.toBeNull();
  expect(extensionId.length).toBeGreaterThan(0);

  await context.close();
});
