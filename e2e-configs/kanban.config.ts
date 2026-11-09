import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for `examples/kanban` — the state-tree + url-state + dnd + toast showcase. The example had NO browser
 * suite, so a regression in any of those packages' integration (a board that renders empty, a search that no longer filters,
 * an add that no longer updates the stats) reached the showcase unnoticed.
 *
 * CI: `bun run test:e2e:kanban` (own matrix step, auto-selected by scripts/e2e-affected.ts).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'kanban', testMatch: /kanban\.spec\.ts$/, port: 5233 }],
  webServer: [viteDevServer('@pyreon/example-kanban', 5233, { strictPort: false })],
})
