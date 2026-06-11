import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-app dogfood gate for the CSS-variables theming mode
 * (`init({ cssVariables: true })`). Drives `examples/cssvars-bench` — a grid
 * of real @pyreon/ui-components + mode(a,b) boxes with a visible dark/light
 * toggle — in real Chromium, proving the mode works end-to-end: a toggle is
 * one documentElement[data-theme] write, the cascade re-resolves var pairs,
 * and component classNames don't churn (the no-re-render contract).
 *
 * Separate config (own webServer) because Playwright boots ALL listed servers
 * regardless of `--project` filter.
 *
 * CI: `bun run test:e2e:cssvars` (own step in the E2E job).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'cssvars', testMatch: /cssvars-showcase\.spec\.ts$/, port: 5211 }],
  webServer: [viteDevServer('@pyreon/example-cssvars-bench', 5211)],
})
