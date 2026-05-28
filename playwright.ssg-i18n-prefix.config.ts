import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Playwright config — SSG i18n `prefix`-strategy real-Chromium gate
 * (PR L3 follow-up to PR L1).
 *
 * Companion to:
 *   - `verify-modes ssr-showcase × ssg-i18n-prefix` cell (PR L1 —
 *     build artifact, asserts `dist/en/about/index.html` exists +
 *     `dist/about/index.html` does NOT)
 *   - The existing `playwright.ssg-i18n.config.ts` (prefix-except-default
 *     runtime gate)
 *
 * PR L1 closed the verify-modes layer for prefix-strategy but left the
 * real-Chromium runtime gate to a follow-up. This config closes it.
 *
 * What's distinct from `playwright.ssg-i18n.config.ts`:
 *   - Strategy `prefix` (not prefix-except-default) — every locale
 *     prefixed, default locale is `/en/...` (NOT `/...`)
 *   - `x-default` hreflang sibling points at en-PREFIXED URL, not
 *     unprefixed
 *   - Port 5200 (next free port after ssg-subpath @ 5198 + ssg-i18n
 *     @ 5199)
 *
 * Same `scripts/serve-ssg.ts` directory-rewriting server — `vite
 * preview` would SPA-fallback `/en/about` to `dist/index.html` which
 * doesn't exist under `prefix` (no unprefixed root in this dist
 * tree). The serve-ssg rewrite resolves `/en/about/` to
 * `dist/en/about/index.html` as a real static host would.
 *
 * Separate config (not folded into playwright.config.ts) because
 * Playwright's `webServer` array boots ALL listed servers regardless
 * of `--project` selection — same boot-isolation rationale as the
 * existing per-strategy / per-mode gates.
 *
 * Specs: `e2e/ssg-i18n-prefix.spec.ts` — see file header.
 *
 * CI: `.github/workflows/ci.yml`'s `E2E` job runs this as a separate
 * step after the existing ssg-i18n step.
 */
export default definePlaywrightConfig({
  timeout: 60_000,
  projects: [
    { name: 'ssg-i18n-prefix', testMatch: /ssg-i18n-prefix\.spec\.ts$/, port: 5200 },
  ],
  webServer: [
    {
      // Build the `prefix`-strategy i18n dist, then serve via the
      // directory-rewriting static server (see ssg-i18n for the rationale).
      command:
        'bun run --filter=@pyreon/ssr-showcase build:i18n-prefix && bun scripts/serve-ssg.ts examples/ssr-showcase/dist 5200',
      port: 5200,
      timeout: 180_000,
    },
  ],
})
