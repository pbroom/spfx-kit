import { defineConfig, devices } from '@playwright/test';

const labPort = process.env.SPFX_KIT_E2E_LAB_PORT || '4173';
const labOrigin = `http://127.0.0.1:${labPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: labOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run build && npm --workspace @spfx-kit/lab run preview',
    url: labOrigin,
    reuseExistingServer: !process.env.CI && process.env.SPFX_KIT_E2E_FRESH_SERVER !== '1',
    timeout: 120_000
  }
});
