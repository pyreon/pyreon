import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for the 7 pre-scaffolded create-pyreon-app fixtures
 * under `examples/cpa-pw-<name>/`. Each spec exercises mount + render,
 * reactive state, routing/hydration, and template-specific surfaces
 * (RSS feed, login, PDF export, etc.).
 *
 * Fixtures are committed (not regenerated per run); a separate
 * `cpa-fixture-drift.ts` script asserts they match what the scaffolder
 * generates today. The `Scaffold Smoke` CI job proves the scaffolder
 * works; this gate proves the scaffolder's OUTPUT works.
 *
 * CI: `bun run test:e2e:cpa` (own step).
 */
export default definePlaywrightConfig({
  projects: [
    { name: 'cpa-app', testMatch: /\/cpa-app\.spec\.ts$/, port: 5191 },
    { name: 'cpa-blog', testMatch: /\/cpa-blog\.spec\.ts$/, port: 5192 },
    { name: 'cpa-dash', testMatch: /\/cpa-dash\.spec\.ts$/, port: 5193 },
    { name: 'cpa-app-react-compat', testMatch: /\/cpa-app-react-compat\.spec\.ts$/, port: 5194 },
    { name: 'cpa-app-vue-compat', testMatch: /\/cpa-app-vue-compat\.spec\.ts$/, port: 5195 },
    { name: 'cpa-app-solid-compat', testMatch: /\/cpa-app-solid-compat\.spec\.ts$/, port: 5196 },
    { name: 'cpa-app-preact-compat', testMatch: /\/cpa-app-preact-compat\.spec\.ts$/, port: 5197 },
  ],
  webServer: [
    viteDevServer('cpa-pw-app', 5191, { strictPort: false }),
    viteDevServer('cpa-pw-blog', 5192, { strictPort: false }),
    viteDevServer('cpa-pw-dash', 5193, { strictPort: false }),
    viteDevServer('cpa-pw-app-react', 5194, { strictPort: false }),
    viteDevServer('cpa-pw-app-vue', 5195, { strictPort: false }),
    viteDevServer('cpa-pw-app-solid', 5196, { strictPort: false }),
    viteDevServer('cpa-pw-app-preact', 5197, { strictPort: false }),
  ],
})
