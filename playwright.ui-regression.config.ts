import { defineConfig } from '@playwright/test'

/**
 * Playwright config — `ui-showcase` real-app regression gate.
 *
 * Separate from the main `playwright.config.ts` because Playwright's
 * `webServer` array boots ALL listed servers regardless of which
 * `--project` is selected. Lumping ui-showcase into the main config
 * caused resource contention with the existing playground + ssr-showcase
 * webservers, producing flaky failures across all 3 suites.
 *
 * Two configs = two sequential boots = stable runs.
 *
 * Specs:
 *   `e2e/ui-showcase-regression.spec.ts` — bug-shape coverage for the
 *   rendering/styling layer (rocketstyle, styler, unistyle, elements,
 *   runtime-dom). See the spec's header for the bug-shape catalogue.
 *
 * CI:
 *   `.github/workflows/ci.yml`'s `E2E` job runs `bun run test:e2e` first
 *   (playground + ssr-showcase via the main config), then
 *   `bun run test:e2e:ui-regression` (this config) as a separate step.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'ui-showcase',
      testMatch: /ui-showcase-regression\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5174' },
    },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-ui-showcase dev -- --port 5174 --strictPort',
      port: 5174,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
