import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Islands-only pages in @pyreon/zero (#4371), real Chromium against a real
 * SSG build of `packages/zero/zero/src/tests/integration/fixture-islands-only`
 * (built from zero's SOURCE by its `build.ts`, the same build the
 * `islands-only-build.test.ts` build-output test asserts on).
 *
 * Proves what only a browser can: the island on an islands-only page
 * hydrates, adopts its server HTML and is interactive while the router never
 * loads, the JS the page actually requests holds no router and no route code,
 * and navigation between app pages and islands-only pages is a full page
 * load in both directions.
 *
 * Served by `scripts/serve-ssg.ts` (per-route `index.html`), never
 * `vite preview`, whose SPA fallback would serve `/` for every path.
 *
 * CI: `bun run test:e2e:zero-islands-only`.
 */
const DIST = 'packages/zero/zero/src/tests/integration/fixture-islands-only/dist'

export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [{ name: 'zero-islands-only', testMatch: /zero-islands-only\.spec\.ts$/, port: 5213 }],
  webServer: [
    {
      command: `bun packages/zero/zero/src/tests/integration/fixture-islands-only/build.ts ${DIST} && bun scripts/serve-ssg.ts ${DIST} 5213`,
      port: 5213,
      // Commands run from the config file's directory; the paths are repo-relative.
      cwd: '..',
      timeout: 180_000,
    },
  ],
})
