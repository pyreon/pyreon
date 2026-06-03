import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * SSG i18n route duplication real-Chromium gate (PR H follow-up).
 * verify-modes asserts BUILD ARTIFACT (per-locale dist files at right
 * prefixes); this gate asserts RUNTIME — router matches the duplicated
 * record at request time, hydration works under prefixed URLs,
 * RouterLink navigates between locale subtrees.
 *
 * Uses `scripts/serve-ssg.ts` (directory-rewriting static server) —
 * `vite preview`'s SPA fallback would serve `dist/index.html` for
 * `/cs/posts` instead of the prerendered `dist/cs/posts/index.html`,
 * masking loader-data hydration (PR #516 investigation).
 *
 * CI: `bun run test:e2e:ssg-i18n` (own step).
 */
const _baseConfig = definePlaywrightConfig({
  timeout: 60_000,
  projects: [
    { name: 'ssg-i18n', testMatch: /ssg-i18n\.spec\.ts$/, port: 5199 },
  ],
  webServer: [
    {
      // cwd: '..' — webServer commands run from the config file's
      // directory by default; this config lives in e2e-configs/ but
      // `scripts/serve-ssg.ts` and `examples/ssr-showcase/dist` are
      // repo-root-relative.
      cwd: '..',
      command:
        'bun run --filter=@pyreon/ssr-showcase build:i18n && bun scripts/serve-ssg.ts examples/ssr-showcase/dist 5199',
      port: 5199,
      timeout: 180_000,
    },
  ],
})

// testDir resolves relative to this config file's directory; the
// repo's e2e/ specs sit one level up.
_baseConfig.testDir = '../e2e'

export default _baseConfig
