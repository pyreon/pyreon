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
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [
    { name: 'ssg-subpath', testMatch: /ssg-subpath\.spec\.ts$/, port: 5198 },
    // A full-URL (CDN) asset base with the route base at `/` (#4269).
    { name: 'ssg-cdn-base', testMatch: /ssg-cdn-base\.spec\.ts$/, port: 5199 },
  ],
  // ONE command builds both variants in sequence (two SSG builds of one
  // fixture at once would share its synthetic entry file) and then serves
  // both; the second entry only waits for its port.
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-ssr-showcase build:subpath && bun run --filter=@pyreon/example-ssr-showcase build:cdn && (bun run --filter=@pyreon/example-ssr-showcase preview:subpath -- --port 5198 --strictPort & bun run --filter=@pyreon/example-ssr-showcase preview:cdn -- --port 5199 --strictPort & wait)',
      port: 5198,
      timeout: 240_000,
    },
    { command: 'tail -f /dev/null', port: 5199, timeout: 240_000 },
  ],
})
