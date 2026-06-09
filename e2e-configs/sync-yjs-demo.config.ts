import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for `@pyreon/sync`'s raw-Yjs track: two tabs editing one
 * synced field stay in sync with ZERO network (BroadcastChannel), and a remote
 * edit patches exactly the bound text node (compiled `_bindText`) with no
 * re-render. This is the real-browser two-tab proof deferred from the package's
 * happy-dom node tests (the `@vitest/browser` harness deadlocked on this
 * worktree's vite dep-optimize graph; the repo's Playwright e2e infra works).
 *
 * Separate config (own webServer) — Playwright boots ALL listed servers
 * regardless of `--project`, so lumping it into the main config risks
 * boot-time resource contention.
 *
 * CI: `bun run test:e2e:sync-yjs-demo` (own matrix step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'sync-yjs-demo', testMatch: /sync-yjs-demo\.spec\.ts$/, port: 5185 }],
  webServer: [viteDevServer('@pyreon/example-sync-yjs', 5185)],
})
