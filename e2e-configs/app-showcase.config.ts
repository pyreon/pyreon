import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * `@pyreon/flow` + `@pyreon/dnd` + `@pyreon/charts` real-app coverage —
 * render shape, pointer-event-driven drag, wheel pan, drag-and-drop,
 * chart mount in real Chromium. Vitest-browser proves the unit surface;
 * this gate proves the cross-package shape.
 *
 * Separate config (own webServer) because Playwright boots ALL listed
 * servers regardless of `--project` filter.
 *
 * CI: `bun run test:e2e:app-showcase` (own step in the E2E job).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    {
      name: 'app-showcase',
      testMatch: /\/app-showcase-(flow|flow-features|dnd|charts)\.spec\.ts$/,
      port: 5181,
    },
  ],
  webServer: [viteDevServer('@pyreon/example-app-showcase', 5181)],
})
