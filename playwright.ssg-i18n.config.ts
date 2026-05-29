import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Playwright config — SSG i18n route duplication real-Chromium gate
 * (PR H follow-up).
 *
 * Companion to `verify-modes ssr-showcase × ssg-i18n` cell. The
 * verify-modes cell asserts the BUILD ARTIFACT (per-locale dist
 * files exist at the right prefixes). This config tests the
 * RUNTIME behaviour: real Chromium loads each per-locale page,
 * the router matches the duplicated route record at request time,
 * and RouterLink navigation works under the locale prefix.
 *
 * The two layers complement each other:
 *   - verify-modes catches build-time regressions (the
 *     `expandRoutesForLocales` call wiring in
 *     `vite-plugin.ts`'s virtual-routes load AND
 *     `ssg-plugin.ts:autoDetectStaticPaths`).
 *   - This e2e catches runtime regressions (the router's matcher
 *     for the duplicated record, hydration under the prefixed URL,
 *     in-app navigation between locale subtrees).
 *
 * webServer chains build + serve. Pre-build runs once via
 * `build:i18n`; `scripts/serve-ssg.ts` then serves the dist on port
 * 5199. Same shape as the ssg-subpath config (port 5198) — separate
 * ports so both gates can run in the same CI step without colliding.
 *
 * **Why `scripts/serve-ssg.ts` instead of `vite preview`**: `vite
 * preview` does SPA fallback — any URL that doesn't map to a literal
 * file in `dist/` returns `dist/index.html`. For SPA builds that's
 * correct, but for SSG it means `/cs/posts` serves `dist/index.html`
 * (the home page) instead of `dist/cs/posts/index.html`. PR #516's
 * spec (c) was documented as a "loader-data hydration framework bug"
 * but investigation revealed the bug was actually this vite-preview
 * artifact: the inline `<script>window.__PYREON_LOADER_DATA__=…</script>`
 * never reached the client because the served HTML was the home
 * page, not the per-route prerendered file. `scripts/serve-ssg.ts`
 * does directory-rewriting (`/cs/posts` → `dist/cs/posts/index.html`)
 * matching how real static hosts (Netlify / Cloudflare Pages /
 * GitHub Pages / S3+CloudFront) serve SSG output. Now the e2e gate
 * tests the genuine production shape.
 *
 * Separate config (not folded into playwright.config.ts) because
 * Playwright's `webServer` array boots ALL listed servers
 * regardless of `--project` selection — same boot-isolation
 * rationale as ui-regression / compat-layers / app-showcase /
 * islands-showcase / ssg-subpath.
 *
 * Specs: `e2e/ssg-i18n.spec.ts` — see file header for coverage map.
 *
 * CI: `.github/workflows/ci.yml`'s `E2E` job runs this as a
 * separate step after the existing test:e2e:ssg-subpath step.
 */
export default definePlaywrightConfig({
  timeout: 60_000,
  projects: [{ name: 'ssg-i18n', testMatch: /ssg-i18n\.spec\.ts$/, port: 5199 }],
  webServer: [
    {
      // Build the i18n dist, then serve via the directory-rewriting static
      // server (NOT `vite preview` — its SPA fallback would serve
      // dist/index.html for /cs/posts instead of the prerendered file).
      command:
        'bun run --filter=@pyreon/ssr-showcase build:i18n && bun scripts/serve-ssg.ts examples/ssr-showcase/dist 5199',
      port: 5199,
      timeout: 180_000,
    },
  ],
})
