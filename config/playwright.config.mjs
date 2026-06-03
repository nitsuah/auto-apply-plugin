import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../tests/e2e',
  // screenshots.spec.mjs is a manual gallery capture utility, not a CI test.
  // Run it explicitly: npx playwright test tests/e2e/screenshots.spec.mjs
  testIgnore: ['**/screenshots.spec.mjs'],
  timeout: 30_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  reporter: 'list',
});
