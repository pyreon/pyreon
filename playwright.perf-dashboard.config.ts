import { defineConfig } from '@playwright/test'

/**
 * Playwright config — perf-dashboard (`@pyreon/example-perf-dashboard`).
 *
 * Separate config (own boot) for the same reason as ui-regression /
 * app-showcase / compat-layers: Playwright's `webServer` array boots ALL
 * listed servers per CI run, so lumping perf-dashboard into the main
 * config would put another Vite dev server up on every playground /
 * fundamentals / ssr-showcase run. Sequential boot = stable.
 *
 * Specs:
 *   `e2e/perf-dashboard-form-state.spec.ts` — hard CI gate for the
 *     `useFormState` selector-narrowing contract. Real-Chromium proof
 *     that `useFormState(form, s => s.isValid)` does NOT scan the field
 *     maps when a field error flips. The unit-level regression test in
 *     `@pyreon/form` is happy-dom; this is the real-browser regression
 *     gate so a future Vite/bundler change that drops the dev-gate
 *     counter (or a `useFormState` regression that re-introduces the
 *     eager scan) fails CI loudly.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // CI: retry flaky specs (overlayfs / timing / HMR-ws / resource-
  // contention races) so a single flake self-heals within its job; a
  // real bug fails all attempts. Local stays 0 for honest, fast feedback.
  retries: process.env.CI ? 2 : 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'perf-dashboard',
      testMatch: /\/perf-dashboard-.*\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5183' },
    },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-perf-dashboard dev -- --port 5183 --strictPort',
      port: 5183,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
