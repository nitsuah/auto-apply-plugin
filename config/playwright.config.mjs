import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '/app/tests/e2e',
  testMatch: ['**/*.spec.mjs'],
  timeout: 30_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  reporter: 'list',
});
