import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * SSG i18n `prefix`-strategy real-Chromium gate (PR L3 follow-up to
 * PR L1). Distinct from the prefix-except-default gate:
 *   - Strategy `prefix` — every locale prefixed (default is `/en/...`)
 *   - `x-default` hreflang points at en-PREFIXED URL, not unprefixed
 *   - Port 5200 (next free after ssg-subpath 5198 / ssg-i18n 5199)
 *
 * Same directory-rewriting `serve-ssg.ts` as the ssg-i18n gate — vite
 * preview's SPA fallback would resolve `/en/about` to `dist/index.html`
 * which doesn't exist under `prefix` (no unprefixed root in this
 * dist tree).
 *
 * CI: `bun run test:e2e:ssg-i18n-prefix` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [
    { name: 'ssg-i18n-prefix', testMatch: /ssg-i18n-prefix\.spec\.ts$/, port: 5200 },
  ],
  webServer: [
    {
      // cwd: '..' — webServer commands run from the config file's
      // directory by default; this config lives in e2e-configs/ but
      // `scripts/serve-ssg.ts` and `examples/ssr-showcase/dist` are
      // repo-root-relative.
      cwd: '..',
      command:
        'bun run --filter=@pyreon/ssr-showcase build:i18n-prefix && bun scripts/serve-ssg.ts examples/ssr-showcase/dist 5200',
      port: 5200,
      timeout: 180_000,
    },
  ],
})
