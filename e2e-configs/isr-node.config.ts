import { definePlaywrightConfig } from '@pyreon/playwright-config'

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
        'bun run --filter=@pyreon/ssr-showcase build:isr && bun run --filter=@pyreon/ssr-showcase start:ssr',
      port: 5207,
      timeout: 180_000,
    },
  ],
})
