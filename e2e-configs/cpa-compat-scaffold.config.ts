import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Compat-mode runtime gate over a freshly scaffolded app. Not a standalone
 * suite: `scripts/scaffold-smoke.ts` runs it for each
 * `cpa-smoke-app-<x>-compat` cell after scaffolding, installing and building
 * `examples/cpa-smoke-app-<x>-compat`, with `CPA_COMPAT=<x>` set.
 *
 * Dev server on purpose, not preview: the bug this gate was written for (an
 * OXC `importSource` resolution failure under compat) only showed in the
 * workspace dev pipeline.
 */
const compat = process.env['CPA_COMPAT'] ?? ''

export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: `cpa-app-${compat}-compat`, testMatch: /\/cpa-app-compat\.spec\.ts$/, port: 5194 }],
  webServer: [viteDevServer(`cpa-smoke-app-${compat}-compat`, 5194, { strictPort: false })],
})
