import { defineConfig } from '@playwright/test'

/**
 * Playwright config — SSG i18n route duplication real-Chromium gate (PR H).
 *
 * Companion to `verify-modes ssr-showcase × ssg-i18n` cell. The
 * verify-modes cell asserts the BUILD ARTIFACT — that per-locale
 * directories (`dist/de/`, `dist/cs/`) exist with the expected
 * `index.html` / `about/index.html` / `posts/{1,2,3}/index.html`
 * variants, AND that the default locale (en) stays unprefixed under
 * `prefix-except-default`. This config tests the RUNTIME behaviour:
 * real Chromium loads each prerendered per-locale page, hydrates, and
 * verifies in-app navigation across the locale-prefixed routes works
 * end-to-end.
 *
 * The two layers complement each other:
 *   - verify-modes catches build-time regressions (the
 *     `expandRoutesForLocales` helper, the `i18n` field on ZeroConfig,
 *     the wiring through both `vite-plugin.ts` (page-routes virtual
 *     module) and `ssg-plugin.ts` (autoDetectStaticPaths).
 *   - This e2e catches runtime regressions (router resolution under
 *     locale-prefixed segments, RouterLink href emission for the
 *     active locale, dynamic route × locale composition under real
 *     hydration).
 *
 * webServer chains build + preview because vite preview doesn't build
 * by itself. Pre-build runs once via `build:i18n`; preview serves
 * the result on port 5199. The chain is safe to run in CI — both halves
 * exit deterministically; only the preview stays up.
 *
 * Separate config (not folded into playwright.config.ts) because
 * Playwright's `webServer` array boots ALL listed servers regardless of
 * `--project` selection — same boot-isolation rationale as
 * ui-regression / compat-layers / app-showcase / islands-showcase /
 * ssg-subpath.
 *
 * Specs: `e2e/ssg-i18n.spec.ts` — see file header for coverage map.
 *
 * CI: `.github/workflows/ci.yml`'s `E2E` job runs this as a separate
 * step after the existing test:e2e steps.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'ssg-i18n',
      testMatch: /ssg-i18n\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5199' },
    },
  ],
  webServer: [
    {
      // `&&` chain: build the i18n dist first, then preview it on a
      // fixed port. The preview command stays alive; the build exits.
      // Playwright considers the server "up" once the port responds.
      command:
        'bun run --filter=@pyreon/ssr-showcase build:i18n && bun run --filter=@pyreon/ssr-showcase preview:i18n -- --port 5199 --strictPort',
      port: 5199,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
