import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Measures the JavaScript each budgeted pyreon.dev route requests on load.
 *
 * Not a test suite: `scripts/check-site-budgets.ts` runs it, once over the
 * head's build and, on a pull request, once over the build of the commit the
 * pull request merges into. It serves the directory in `PYREON_SITE_DIST`
 * as it is (no build), so both sides are measured by the same code.
 *
 * Four workers: every route is its own page load and they share nothing.
 */
const port = Number(process.env['PYREON_SITE_PORT'] ?? 5196)
const dist = process.env['PYREON_SITE_DIST'] ?? 'docs/dist'

export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  workers: 4,
  projects: [{ name: 'site-sizes', testMatch: /site-sizes\.measure\.ts$/, port }],
  webServer: [{ command: `bun scripts/serve-ssg.ts ${JSON.stringify(dist)} ${port}`, port, cwd: '..' }],
})
