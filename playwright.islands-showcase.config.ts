import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config — islands-showcase (`@pyreon/islands-showcase`).
 *
 * Separate from the main `playwright.config.ts` because Playwright's
 * `webServer` array boots ALL listed servers regardless of which
 * `--project` is selected. Adding islands-showcase to the main config
 * would boot another Vite dev server on every CI run that exercises
 * only playground / fundamentals / ssr-showcase — significant resource
 * pressure that's already manifested as flakes in earlier wired-in
 * configs (`playwright.ui-regression.config.ts`,
 * `playwright.compat-layers.config.ts`).
 *
 * Sequential boot via a separate config = stable runs.
 *
 * Specs:
 *   `e2e/islands-showcase.spec.ts` — `@pyreon/server` island architecture
 *     in real Chromium against `examples/islands-showcase`. Each spec
 *     covers one hydration strategy end-to-end:
 *       - `load`     — Counter mounts immediately, click increments
 *       - `idle`     — IdleClock hydrates after requestIdleCallback
 *       - `visible`  — VisibleComments only hydrates on scroll
 *       - `media`    — MobileMenu only hydrates under matching viewport
 *       - `never`    — StaticBadge stays SSR-only, no JS loads
 *
 * The `mobile` project drops viewport to 375×667 so the
 * `media((max-width: 768px))` spec can verify mobile-only hydration
 * in the same run (the desktop project, at the default 1280×720,
 * proves that island STAYS un-hydrated above 768px).
 *
 * CI:
 *   `.github/workflows/ci.yml`'s `E2E` job runs `bun run test:e2e:islands`
 *   (this config) as a separate step alongside `test:e2e` and the other
 *   per-app specs.
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
      name: 'islands-showcase',
      testMatch: /\/islands-showcase\.spec\.ts$/,
      use: {
        baseURL: 'http://localhost:5182',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'islands-showcase-mobile',
      testMatch: /\/islands-showcase-mobile\.spec\.ts$/,
      use: {
        ...devices['iPhone 12'],
        baseURL: 'http://localhost:5182',
      },
    },
  ],
  webServer: [
    {
      command: 'bun run --filter=@pyreon/islands-showcase dev -- --port 5182 --strictPort',
      port: 5182,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
