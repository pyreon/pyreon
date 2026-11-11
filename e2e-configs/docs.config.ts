import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * docs real-Chromium gate — production docs site (@pyreon/docs).
 *
 * Exercises the static SSG artifact served like pyreon.dev:
 *   - landing page renders the PyreonLanding component
 *   - sidebar nav from /docs/getting-started to /docs/router works
 *   - Toc scroll-spy on a long page (reactivity.md)
 *   - 404 page renders for an unknown URL
 *   - APICard / PropTable rendering on router.md
 *   - the marketing shell (site-shell.spec.ts)
 *   - the story / compare / migrate / benchmarks / project pages (site-pages.spec.ts)
 *
 * Booted on port 5191. A dev server's fallback can hide missing generated
 * routes, and its cold-import reloads can discard example state mid-test.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [
    { name: 'docs', testMatch: /docs\.spec\.ts$/, port: 5191 },
    // The marketing shell (nav, menus, mobile sheet, theme, widths, contrast).
    { name: 'site-shell', testMatch: /site-shell\.spec\.ts$/, port: 5191 },
    // The homepage and the static-page architecture (JS budget, sitemap, 404).
    { name: 'site-home', testMatch: /site-home\.spec\.ts$/, port: 5191 },
    // Story, compare, migrate, benchmarks and project pages (routes, widths, switchers, contrast).
    { name: 'site-pages', testMatch: /site-pages\.spec\.ts$/, port: 5191 },
  ],
  webServer: [
    {
      command: 'bun run --filter=@pyreon/docs build && bun scripts/serve-ssg.ts docs/dist 5191',
      port: 5191,
      cwd: '..',
      timeout: 300_000,
    },
  ],
})
