import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '**/*.spec.js', timeout: 120_000, workers: 1,
 use: { baseURL: 'http://127.0.0.1:4173/calque/', browserName: 'chromium',
  launchOptions: { executablePath: process.env.CHROMIUM_PATH || (process.env.CI ? undefined : '/usr/bin/chromium'), args: ['--no-sandbox'] },
  trace: 'retain-on-failure' },
 webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173/calque/', reuseExistingServer: !process.env.CI },
});
