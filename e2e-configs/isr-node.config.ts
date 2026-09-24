import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { definePlaywrightConfig } from '@pyreon/playwright-config'

// The built server's stderr goes to a file the spec reads, so it can assert
// what production LOGS for a failing request (a 500 must name `[Pyreon]` and
// the path). Exported through the env so the spec process sees the same path.
const STDERR_LOG = join(tmpdir(), `pyreon-e2e-isr-node-stderr.log`)
process.env.PYREON_E2E_SERVER_STDERR = STDERR_LOG

/**
 * ISR node-deploy real-Chromium gate.
 *
 * Builds `examples/ssr-showcase` in `mode: 'isr'` (node adapter) and runs the
 * EMITTED `node dist/index.js` — whose handler is wrapped by
 * `createISRHandler` (per-request SSR + in-process LRU caching). Proves the
 * ISR deploy artifact (a) builds + boots, (b) server-renders + HYDRATES (same
 * production-template path as SSR — hashed entry, not the dev `/src/...`), and
 * (c) serves cache-consistent HTML across repeated requests.
 *
 * The caching SEMANTICS (LRU eviction, TTL, cacheKey, revalidate) are
 * unit-covered by `packages/zero/zero/src/tests/isr.test.ts` (47 specs); this
 * gate is the end-to-end "the ISR-mode deploy artifact actually runs" proof
 * that ISR previously lacked (no verify-modes cell, no e2e, no example config).
 *
 * The server bakes its port (5207) from `vite.config.isr.ts`. `start:ssr`
 * (`node dist/index.js`) is mode-agnostic — it runs whatever the build staged.
 * CI: `bun run test:e2e:isr-node` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'isr-node', testMatch: /isr-node\.spec\.ts$/, port: 5207 }],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-ssr-showcase build:isr && node ../examples/ssr-showcase/dist/index.js 2> ' + JSON.stringify(STDERR_LOG),
      port: 5207,
      timeout: 180_000,
    },
  ],
})
