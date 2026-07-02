import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * SSR node-deploy real-Chromium gate (Bug A + C).
 *
 * Builds `examples/ssr-showcase` in `mode: 'ssr'` with the default node
 * adapter, then runs the EMITTED `node dist/index.js` HTTP server (NOT a
 * vite dev/preview server) — the actual production deploy artifact.
 *
 * Proves the two things verify-modes (build-artifact) + the adapters unit
 * tests (mock-handler spawn-and-curl) don't together cover end-to-end: the
 * REAL ssr-showcase app, through the FULL plugin → adapter chain, (a) boots
 * (pre-fix the adapter's copy-into-self `cp(dist → dist/client)` threw
 * EINVAL, caught + not rethrown, so `dist/index.js` was never produced and
 * SSR/ISR was unrunnable), and (b) SERVER-RENDERS every route including `/`
 * (pre-fix `/` was served the unfilled `<!--pyreon-app-->` template shell).
 *
 * The node server bakes its port (5203) from `vite.config.ssr.ts`'s
 * `zero({ port: 5203 })`. CI: `bun run test:e2e:ssr-node` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'ssr-node', testMatch: /ssr-node\.spec\.ts$/, port: 5203 }],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-ssr-showcase build:ssr && bun run --filter=@pyreon/example-ssr-showcase start:ssr',
      port: 5203,
      timeout: 180_000,
    },
  ],
})
