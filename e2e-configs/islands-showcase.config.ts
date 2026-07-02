import { devices } from '@playwright/test'
import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * `@pyreon/server` island architecture real-Chromium gate. Each spec
 * covers one hydration strategy:
 *   - `load`        Counter mounts immediately, click increments
 *   - `idle`        IdleClock hydrates after requestIdleCallback
 *   - `visible`     VisibleComments hydrates on scroll
 *   - `media`       MobileMenu hydrates only under matching viewport
 *   - `never`       StaticBadge stays SSR-only (zero JS)
 *
 * The `islands-showcase-mobile` project drops viewport to iPhone 12 so
 * the `media((max-width: 768px))` spec can verify mobile-only hydration
 * in the same run (the desktop project, at 1280×720, proves the same
 * island STAYS un-hydrated above 768px).
 *
 * CI: `bun run test:e2e:islands` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    {
      name: 'islands-showcase',
      testMatch: /\/islands-showcase\.spec\.ts$/,
      port: 5182,
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'islands-showcase-mobile',
      testMatch: /\/islands-showcase-mobile\.spec\.ts$/,
      port: 5182,
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-islands-showcase', 5182)],
})
