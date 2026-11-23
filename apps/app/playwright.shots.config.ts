import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** The site's screenshots (site-shots/shots.spec.ts), on the static export like the end-to-end tests; run by hand. */
export default defineConfig({
  ...base,
  testDir: 'site-shots',
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
