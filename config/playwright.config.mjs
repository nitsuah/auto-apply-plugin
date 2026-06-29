import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './../tests/e2e',
  timeout: 60_000, // Increased timeout for debugging CI issues
  fullyParallel: true, // Run tests in parallel
  forbidOnly: !!process.env.CI, // Disallow .only in CI
  retries: process.env.CI ? 2 : 0, // Retry on CI
  workers: process.env.CI ? 1 : undefined, // Limit workers on CI to prevent OOM
  reporter: 'list',
  use: {
    trace: 'on-first-retry', // Capture trace on first retry of a failed test
  },
});

