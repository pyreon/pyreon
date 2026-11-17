import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for the 3 pre-scaffolded create-zero fixtures
 * under `examples/cpa-pw-<name>/`. Each spec exercises mount + render,
 * reactive state, routing/hydration, and template-specific surfaces
 * (RSS feed, login, PDF export, etc.).
 *
 * Fixtures are committed (not regenerated per run);
 * `bun scripts/scaffold-cpa-fixtures.ts --check` (validate-fast) asserts
 * they match what the scaffolder generates today. The `Scaffold Smoke` CI
 * job proves the scaffolder works, and runs the compat-mode runtime suite
 * (`cpa-compat-scaffold.config.ts`) against fresh `--compat` scaffolds;
 * this gate proves the scaffolder's committed OUTPUT works.
 *
 * CI: `bun run test:e2e:cpa` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    { name: 'cpa-app', testMatch: /\/cpa-app\.spec\.ts$/, port: 5191 },
    { name: 'cpa-blog', testMatch: /\/cpa-blog\.spec\.ts$/, port: 5192 },
    { name: 'cpa-dash', testMatch: /\/cpa-dash\.spec\.ts$/, port: 5193 },
  ],
  webServer: [
    viteDevServer('@pyreon/example-cpa-pw-app', 5191, { strictPort: false }),
    viteDevServer('@pyreon/example-cpa-pw-blog', 5192, { strictPort: false }),
    viteDevServer('@pyreon/example-cpa-pw-dash', 5193, { strictPort: false }),
  ],
})
