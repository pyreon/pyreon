import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Zero's development error overlay in a real browser, against a real dev
 * server: an SSR render error, a loader error and a hydration mismatch.
 *
 * Boots its own fixture app (`packages/zero/zero/src/tests/integration/
 * dev-overlay-fixture`) rather than a shared example, because three of its
 * routes fail on purpose. The fixture lives inside the zero package so its
 * `@pyreon/*` imports resolve through zero's own dependencies; it imports
 * zero by relative path and resolves with the `bun` condition, so the suite
 * runs the source and cannot pass against a stale `lib/`.
 *
 * CI: `bun run test:e2e:zero-dev-overlay`.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'zero-dev-overlay', testMatch: /zero-dev-overlay\.spec\.ts$/, port: 5212 }],
  webServer: [
    {
      cwd: '..',
      env: { VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
      command: 'bunx vite dev packages/zero/zero/src/tests/integration/dev-overlay-fixture --port 5212 --strictPort',
      port: 5212,
      timeout: 180_000,
    },
  ],
})
