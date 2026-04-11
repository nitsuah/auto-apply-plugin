import { defineConfig } from 'vitest/config';

// Vitest Configuration for a JavaScript project
export default defineConfig({
  test: {
    // Enable global APIs like `describe`, `it`, `expect` without explicit imports
    globals: true,
    // Set the test environment to Node.js, suitable for most backend/library JavaScript projects
    environment: 'node',
    // Coverage configuration
    coverage: {
      // Use the 'v8' provider for fast and accurate coverage reporting
      provider: 'v8',
      // Define reporters for different output formats
      reporter: ['text', 'json', 'html'],
      // Set coverage thresholds to ensure code quality
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      // Exclude common directories and test files from coverage reports
      exclude: [
        'node_modules/', // Standard exclusion for installed packages
        'dist/',         // Standard exclusion for build output
        '**/*.test.js',  // Exclude JavaScript test files
        '**/*.spec.js',  // Exclude JavaScript spec files
      ],
    },
  },
});