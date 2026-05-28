import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Playwright config — `ui-showcase` real-app regression gate.
 *
 * Separate from the main `playwright.config.ts` because Playwright's
 * `webServer` array boots ALL listed servers regardless of which
 * `--project` is selected. Lumping ui-showcase into the main config
 * caused resource contention with the existing playground + ssr-showcase
 * webservers, producing flaky failures across all 3 suites.
 *
 * Two configs = two sequential boots = stable runs.
 *
 * Specs:
 *   `e2e/ui-showcase-regression.spec.ts` — bug-shape coverage for the
 *   rendering/styling layer (rocketstyle, styler, unistyle, elements,
 *   runtime-dom). See the spec's header for the bug-shape catalogue.
 *
 * CI:
 *   `.github/workflows/ci.yml`'s `E2E` job runs `bun run test:e2e` first
 *   (playground + ssr-showcase via the main config), then
 *   `bun run test:e2e:ui-regression` (this config) as a separate step.
 */
export default definePlaywrightConfig({
  projects: [
    { name: 'ui-showcase', testMatch: /ui-showcase-regression\.spec\.ts$/, port: 5174 },
  ],
  webServer: [viteDevServer('@pyreon/example-ui-showcase', 5174)],
})
