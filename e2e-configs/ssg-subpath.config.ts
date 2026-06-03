import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * SSG subpath / base-path real-Chromium gate (PR E). verify-modes
 * asserts asset URLs + RouterLink hrefs in emitted HTML carry the
 * `/blog/` prefix; this gate asserts the RUNTIME — Chromium loads the
 * prerendered page under `/blog/`, clicks a RouterLink, and confirms
 * client-side navigation works under the base prefix.
 *
 * `vite preview` is fine here — specs only assert on root /
 * RouterLink-href / asset-URL shapes, never per-route prerendered HTML.
 *
 * CI: `bun run test:e2e:ssg-subpath` (own step).
 */
const _baseConfig = definePlaywrightConfig({
  timeout: 60_000,
  projects: [
    { name: 'ssg-subpath', testMatch: /ssg-subpath\.spec\.ts$/, port: 5198 },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/ssr-showcase build:subpath && bun run --filter=@pyreon/ssr-showcase preview:subpath -- --port 5198 --strictPort',
      port: 5198,
      timeout: 180_000,
    },
  ],
})

// testDir resolves relative to this config file's directory; the
// repo's e2e/ specs sit one level up.
_baseConfig.testDir = '../e2e'

export default _baseConfig
