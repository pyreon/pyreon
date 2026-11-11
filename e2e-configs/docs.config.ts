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
    { name: 'docs', testMatch: /\/docs\.spec\.ts$/, port: 5191 },
    // The docs pages as static HTML with islands (crawl, islands, budgets, readability).
    { name: 'site-docs', testMatch: /site-docs\.spec\.ts$/, port: 5191 },
    // The marketing shell (nav, menus, mobile sheet, theme, widths, contrast).
    { name: 'site-shell', testMatch: /site-shell\.spec\.ts$/, port: 5191 },
    // The homepage and the static-page architecture (JS budget, sitemap, 404).
    { name: 'site-home', testMatch: /site-home\.spec\.ts$/, port: 5191 },
    // Story, compare, migrate, benchmarks and project pages (routes, widths, switchers, contrast).
    { name: 'site-pages', testMatch: /site-pages\.spec\.ts$/, port: 5191 },
    // Product pages, core/platform and data/state groups (pages, demos, widths, contrast).
    { name: 'site-products-a', testMatch: /site-products-a\.spec\.ts$/, port: 5191 },
    // The app-building-blocks and visual-and-tools product pages and their demos.
    { name: 'site-products-b', testMatch: /\/site-products-b[^/]*\.spec\.ts$/, port: 5191 },
    // The blog, showcase, open stats and stable-link pages (posts, islands, widths, contrast).
    { name: 'site-project', testMatch: /site-project\.spec\.ts$/, port: 5191 },
    // The blog's layout, "Up next" and the build with no published post (docs/dist-scheduled).
    { name: 'site-blog', testMatch: /site-blog\.spec\.ts$/, port: 5191 },
    // Every internal href and #fragment in the built output resolves (reads dist, no browser).
    { name: 'site-links', testMatch: /site-links\.spec\.ts$/, port: 5191 },
  ],
  webServer: [
    {
      // First a build dated before the first post (docs/dist-scheduled: no post published, every post
      // "Up next"; site-blog.spec.ts reads it from disk), then the served build, where every scheduled
      // post is published (site-project.spec.ts tests posts, tags and paging).
      command:
        '(cd docs && PYREON_CONTENT_NOW=2026-11-12 bunx vite build --outDir dist-scheduled --emptyOutDir) && PYREON_CONTENT_NOW=2099-01-01 bun run --filter=@pyreon/docs build && bun scripts/serve-ssg.ts docs/dist 5191',
      port: 5191,
      cwd: '..',
      timeout: 480_000,
    },
  ],
})
