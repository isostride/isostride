import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the static export, served like any static host.
 * Chromium stands for Chrome, Edge and Opera; WebKit (Safari) checks the not-supported
 * message. Playwright's Firefox build does not start on this macOS (Darwin 27); Firefox
 * takes the same code path as Safari (no showDirectoryPicker).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  // The journeys gate the change: no retries and no test.only left behind.
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }]],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run -s build && node scripts/static-server.mjs .next-build 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /unsupported/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /unsupported/ },
  ],
});
