import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Islands-in-@pyreon/zero real-Chromium gate (Bug 2 / E).
 *
 * Proves the zero-native island story end-to-end: the `/island-demo` route
 * declares an island via `import { island } from '@pyreon/zero'` (NO
 * @pyreon/server dep), its entry-client is just `startClient({ routes })` (NO
 * manual hydrateIslandsAuto). The island SELF-HYDRATES on mount (zero re-mounts
 * route content client-side, so the island owns its own hydration lifecycle
 * rather than relying on a one-shot external scan). The SSG build emits the
 * `<pyreon-island>` marker + a code-split chunk; this gate confirms the RUNTIME
 * — the island hydrates with no manual wiring and a click drives its signal
 * (the Bug 3/F "Cannot read properties of undefined (reading 'ref')" crash was
 * the dual @pyreon/core instance; with the client-safe import + self-hydration
 * the hydrated island's reactivity works).
 *
 * `vite preview` is fine — the island lives on `/` (dist/index.html), no
 * per-route directory rewrite needed.
 *
 * CI: `bun run test:e2e:zero-islands` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'zero-islands', testMatch: /zero-islands\.spec\.ts$/, port: 5202 }],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/ssr-showcase build:islands && bun run --filter=@pyreon/ssr-showcase preview:islands -- --port 5202 --strictPort',
      port: 5202,
      timeout: 180_000,
    },
  ],
})
