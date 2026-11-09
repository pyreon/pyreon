import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for `examples/chat` — the router + query (`useMutation`) + SSE (`useStream`) + url-state showcase.
 * Its dev server also hosts the SSE / history / send backend (`vite.config.ts`), so one webServer covers the whole loop.
 * The example had NO browser suite.
 *
 * CI: `bun run test:e2e:chat` (own matrix step, auto-selected by scripts/e2e-affected.ts).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'chat', testMatch: /chat\.spec\.ts$/, port: 5234 }],
  webServer: [viteDevServer('@pyreon/example-chat', 5234, { strictPort: false })],
})
