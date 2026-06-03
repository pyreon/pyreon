import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-app regression gate for the rendering/styling layer (rocketstyle,
 * styler, unistyle, elements, runtime-dom). Specs in
 * `e2e/ui-showcase-regression.spec.ts` replicate bug-shapes from PRs
 * #197/#200/#336/#349 — future regressions in the same shapes fail fast.
 *
 * Separate config (own webServer) because Playwright boots ALL listed
 * servers regardless of `--project` filter — lumping ui-showcase into
 * the main config produces resource-contention flakes during boot.
 *
 * CI: `bun run test:e2e:ui-regression` (own step in the E2E job).
 */
const _baseConfig = definePlaywrightConfig({
  projects: [
    { name: 'ui-showcase', testMatch: /ui-showcase-regression\.spec\.ts$/, port: 5174 },
  ],
  webServer: [viteDevServer('@pyreon/example-ui-showcase', 5174)],
})

// testDir resolves relative to this config file's directory; the
// repo's e2e/ specs sit one level up.
_baseConfig.testDir = '../e2e'

export default _baseConfig
