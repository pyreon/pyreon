import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

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
export default definePlaywrightConfig({
  timeout: 60_000,
  projects: [{ name: 'perf-dashboard', testMatch: /\/perf-dashboard-.*\.spec\.ts$/, port: 5183 }],
  webServer: [viteDevServer('@pyreon/example-perf-dashboard', 5183)],
})
