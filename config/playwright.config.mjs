import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '/app/tests/e2e',
  timeout: 30_000,
  reporter: 'list',
});
