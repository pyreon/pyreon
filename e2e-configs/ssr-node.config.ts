import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { definePlaywrightConfig } from '@pyreon/playwright-config'

// The built server's stderr goes to a file the spec reads, so it can assert
// what production LOGS for a failing request (a 500 must name `[Pyreon]` and
// the path). Exported through the env so the spec process sees the same path.
const STDERR_LOG = join(tmpdir(), `pyreon-e2e-ssr-node-stderr.log`)
process.env.PYREON_E2E_SERVER_STDERR = STDERR_LOG

/**
 * SSR node-deploy real-Chromium gate (Bug A + C).
 *
 * Builds `examples/fixtures/ssr-showcase` in `mode: 'ssr'` with the default node
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
  projects: [
    { name: 'ssr-node', testMatch: /ssr-node\.spec\.ts$/, port: 5203 },
    // The same fixture under `/sub/` (`vite.config.ssr-base.ts`, port 5204):
    // server islands signed, served and verified under a base.
    { name: 'ssr-base', testMatch: /ssr-base\.spec\.ts$/, port: 5204 },
  ],
  webServer: [
    {
      command:
        // Both builds run in sequence (two builds of one fixture at once share
        // its synthetic entry file), then both servers start; the second
        // webServer entry only waits for its port.
        'bun run --filter=@pyreon/example-ssr-showcase build:ssr && bun run --filter=@pyreon/example-ssr-showcase build:ssr-base && ' +
        '(node ../examples/fixtures/ssr-showcase/dist-ssr-base/index.js & node ../examples/fixtures/ssr-showcase/dist/index.js 2> ' + JSON.stringify(STDERR_LOG) + ')',
      port: 5203,
      timeout: 240_000,
    },
    { command: 'tail -f /dev/null', port: 5204, timeout: 240_000 },
  ],
})
