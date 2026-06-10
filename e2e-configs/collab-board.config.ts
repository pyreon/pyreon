import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for `examples/collab-board` — the collaborative kanban
 * showcase. Two ISOLATED browser contexts converge through the WebSocket relay
 * (`@pyreon/sync/server`): an add / title-edit / cross-column move in one client
 * appears in the other.
 *
 * Two webServers: the example's Vite dev server (5189) and the relay
 * (`examples/collab-board/relay.ts`, which attaches the WS relay to a plain http
 * server with a health endpoint so the port answers Playwright's readiness
 * probe, 5190). Separate config (own webServers) — Playwright boots ALL listed
 * servers regardless of `--project`, so isolating it avoids boot-time resource
 * contention with the other suites.
 *
 * CI: `bun run test:e2e:collab-board` (own matrix step, auto-selected by
 * scripts/e2e-affected.ts).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'collab-board', testMatch: /collab-board\.spec\.ts$/, port: 5189 }],
  webServer: [
    viteDevServer('@pyreon/example-collab-board', 5189),
    {
      // webServer commands run from the config file's directory by default;
      // `cwd: '..'` makes the relay script path repo-root-relative.
      cwd: '..',
      command: 'bun examples/collab-board/relay.ts',
      port: 5190,
      timeout: 60_000,
    },
  ],
})
