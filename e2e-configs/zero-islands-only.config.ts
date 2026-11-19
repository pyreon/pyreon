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
 * The second server is the same fixture built in `mode: 'ssr'` (node
 * adapter) and run as `node .dist-ssr/index.js`: the suite reads the
 * server-rendered HTML of both page kinds from it (the client-start
 * modulepreloads). Playwright starts the web servers one after the other, so
 * the two builds of the same root never overlap.
 *
 * CI: `bun run test:e2e:zero-islands-only`.
 */
const FIXTURE = 'packages/zero/zero/src/tests/integration/fixture-islands-only'
const DIST = `${FIXTURE}/dist`
// A dot-dir: the islands-registry prescan skips dot-dirs at any depth (and
// `dist` only by that name), so neither build reads the other's output as
// source. A `dist-ssr` here put the server bundle's island() calls into the
// SSG build's islands registry.
const DIST_SSR = `${FIXTURE}/.dist-ssr`

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
    {
      command: `bun ${FIXTURE}/build.ts ${DIST_SSR} ssr 5214 && PORT=5214 node ${DIST_SSR}/index.js`,
      port: 5214,
      cwd: '..',
      timeout: 180_000,
    },
    {
      command: `bun ${FIXTURE}/dev.ts 5218`,
      port: 5218,
      cwd: '..',
      timeout: 180_000,
    },
  ],
})
