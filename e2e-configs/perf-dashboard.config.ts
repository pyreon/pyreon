import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * `@pyreon/form` `useFormState` selector-narrowing regression gate.
 * Real Chromium proof that `useFormState(form, s => s.isValid)` does NOT
 * scan field maps when a field error flips — the unit-level test is
 * happy-dom, this is the real-browser regression catch.
 *
 * CI: `bun run test:e2e:perf-dashboard` (own step in the E2E job).
 */
export default definePlaywrightConfig({
  timeout: 60_000,
  projects: [
    { name: 'perf-dashboard', testMatch: /perf-dashboard-.*\.spec\.ts$/, port: 5183 },
  ],
  webServer: [viteDevServer('@pyreon/example-perf-dashboard', 5183)],
})
