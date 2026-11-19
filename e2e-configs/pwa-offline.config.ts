import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Offline and installable-app gate (`zero({ pwa })`, `@pyreon/query/persist`,
 * `useServiceWorkerUpdate`, `useInstallPrompt`) in real Chromium.
 *
 * Builds `examples/fixtures/pwa-offline` (SSG + pwa) and serves it with
 * `vite preview`. The spec mutates that build's `dist/` to simulate a deployed
 * update, so it always builds fresh (`reuseExistingServer` stays off).
 *
 * CI: `bun run test:e2e:pwa-offline`.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'pwa-offline', testMatch: /pwa-offline\.spec\.ts$/, port: 5231 }],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-pwa-offline build && bun run --filter=@pyreon/example-pwa-offline preview -- --port 5231 --strictPort',
      port: 5231,
      timeout: 180_000,
    },
  ],
})
