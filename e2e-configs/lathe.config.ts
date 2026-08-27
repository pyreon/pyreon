import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * End-to-end gate for `@pyreon/lathe`.
 *
 * Drives `examples/lathe-bookshelf`, an app in which NOTHING declares a URL, a
 * method, a query key or a response type — all of it comes from `openapi.yaml`
 * through `lathe generate`. Real Chromium against a real HTTP endpoint (Vite
 * dev middleware), so what is proven is the generated URL, method and decode,
 * not just that a component rendered.
 *
 * Separate config (own webServer) because Playwright boots every listed server
 * regardless of the `--project` filter.
 *
 * CI: `bun run test:e2e:lathe`.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'lathe', testMatch: /lathe-bookshelf\.spec\.ts$/, port: 5199 }],
  webServer: [viteDevServer('@pyreon/example-lathe-bookshelf', 5199)],
})
