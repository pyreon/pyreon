import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium proof of `@pyreon/sync`'s CROSS-DEVICE track: two ISOLATED
 * browser contexts (no shared origin → no shared BroadcastChannel, no shared
 * storage) converge on one synced field ONLY via the WebSocket relay
 * (`@pyreon/sync/server`). Where `sync-yjs-demo` proves zero-network same-origin
 * sync, this proves the relay path — the genuinely cross-device case.
 *
 * Two webServers: the example's Vite dev server, and the relay (booted from
 * `examples/sync-yjs-demo/relay.ts`, which attaches the WS relay to a plain http
 * server with a health endpoint so this port answers Playwright's HTTP readiness
 * probe). Separate config (own webServers) — Playwright boots ALL listed servers
 * regardless of `--project`, so isolating it avoids boot-time resource
 * contention with the other suites.
 *
 * CI: `bun run test:e2e:sync-ws-relay` (own matrix step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'sync-ws-relay', testMatch: /sync-ws-relay\.spec\.ts$/, port: 5188 }],
  webServer: [
    viteDevServer('@pyreon/example-sync-yjs', 5188),
    {
      // cwd: '..' — webServer commands run from the config file's directory by
      // default; the relay script path is repo-root-relative.
      cwd: '..',
      command: 'bun examples/sync-yjs-demo/relay.ts',
      port: 5186,
      timeout: 60_000,
    },
  ],
})
