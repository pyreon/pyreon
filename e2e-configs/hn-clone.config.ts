import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for `examples/hn-clone` — the router + query + zero showcase. The example reads a third-party API
 * (`api.hnpwa.com`) from the browser, so the spec answers those requests itself (`page.route`): deterministic, offline,
 * and it asserts exactly which URLs the app asks for. The example had NO browser suite.
 *
 * CI: `bun run test:e2e:hn-clone` (own matrix step, auto-selected by scripts/e2e-affected.ts).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'hn-clone', testMatch: /hn-clone\.spec\.ts$/, port: 5235 }],
  webServer: [viteDevServer('@pyreon/example-hn-clone', 5235, { strictPort: false })],
})
