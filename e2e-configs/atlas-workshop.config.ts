import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-app e2e gate for the Atlas Component Workshop (`examples/atlas-workshop`)
 * — the Storybook-alternative UI built entirely on the Pyreon stack (zero SSR +
 * rocketstyle-on-elements + styler `ThemeProvider`, no inline styles).
 *
 * This is the AUTHORITATIVE proof the workshop actually WORKS in a real browser:
 * the rocketstyle `.theme()` → `extendCss` → unistyle pipeline emits real CSS
 * (computed-style assertions), the reactive theme swap re-resolves, controls
 * drive the live preview, and the view/addon tabs switch. happy-dom + a green
 * `vite build` cannot see any of this.
 *
 * Separate config (own webServer) because Playwright boots ALL listed servers
 * regardless of `--project` filter — a dedicated port avoids boot contention.
 *
 * CI: `bun run test:e2e:atlas`.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    { name: 'atlas-workshop', testMatch: /atlas-workshop\.spec\.ts$/, port: 5208 },
  ],
  webServer: [viteDevServer('@pyreon/example-atlas-workshop', 5208)],
})
