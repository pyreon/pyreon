import { defineConfig } from '@playwright/test'

/**
 * Playwright config — Zero component-HMR real-Chromium gate.
 *
 * Boots `examples/ssr-showcase` in DEV mode (real zero dev SSR + Vite
 * HMR — the exact pipeline a user runs `vite` against) on a dedicated
 * port and drives `e2e/zero-hmr.spec.ts`, which edits a route component
 * file mid-test and asserts the DOM updates IN PLACE without a manual
 * (or automatic) page reload while the module-scope signal keeps its
 * value.
 *
 * This is the runtime gate for the fix to the bare-`import.meta.hot
 * .accept()` bug: `@pyreon/vite-plugin` now emits a coordinator-driven
 * accept that calls `@pyreon/router`'s `_hmrReload` to re-resolve the
 * active route's lazy component in place. Unit tests (router 518 specs,
 * vite-plugin 83 specs) prove the wiring; only a real dev server +
 * real Chromium + a real file edit proves the end-to-end contract.
 *
 * Separate config (not folded into playwright.config.ts) because
 * Playwright's `webServer` array boots ALL listed servers regardless of
 * `--project` selection — same boot-isolation rationale as
 * ssg-subpath / ssg-i18n / ui-regression / compat-layers / app-showcase.
 *
 * `workers: 1` — the spec mutates a committed source file and restores
 * it; concurrent specs editing the same file would race.
 *
 * CI: `.github/workflows/ci.yml`'s `E2E` job runs this as a separate
 * step (`bun run test:e2e:zero-hmr`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'zero-hmr',
      testMatch: /zero-hmr\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5201' },
    },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/ssr-showcase dev -- --port 5201 --strictPort',
      port: 5201,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
