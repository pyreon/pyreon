import { defineConfig } from '@playwright/test'

/**
 * Playwright config — SSG subpath / base-path real-Chromium gate (PR E).
 *
 * Companion to `verify-modes ssr-showcase × ssg-subpath` cell. The
 * verify-modes cell asserts the BUILD ARTIFACT — that asset URLs and
 * RouterLink hrefs in the emitted HTML carry the `/blog/` prefix. This
 * config tests the RUNTIME behaviour: real Chromium loads the
 * prerendered page served at `/blog/`, clicks a RouterLink, and asserts
 * client-side navigation works correctly under the base prefix.
 *
 * The two layers complement each other:
 *   - verify-modes catches build-time regressions (Vite's base wiring,
 *     SSG entry's createApp({ base }) forwarding).
 *   - This e2e catches runtime regressions (router's base-stripping in
 *     `stripBase`, in-app history.pushState targeting under base, the
 *     hydration → click → patch round-trip).
 *
 * webServer chains build + preview because vite preview doesn't build
 * by itself. Pre-build runs once via `build:subpath`; preview serves
 * the result on port 5198. The chain is safe to run in CI — both halves
 * exit deterministically; only the preview stays up.
 *
 * Separate config (not folded into playwright.config.ts) because
 * Playwright's `webServer` array boots ALL listed servers regardless of
 * `--project` selection — same boot-isolation rationale as
 * ui-regression / compat-layers / app-showcase / islands-showcase.
 *
 * Specs: `e2e/ssg-subpath.spec.ts` — see file header for coverage map.
 *
 * CI: `.github/workflows/ci.yml`'s `E2E` job runs this as a separate
 * step after the existing test:e2e steps.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'ssg-subpath',
      testMatch: /ssg-subpath\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5198' },
    },
  ],
  webServer: [
    {
      // `&&` chain: build the subpath dist first, then preview it on a
      // fixed port. The preview command stays alive; the build exits.
      // Playwright considers the server "up" once the port responds.
      command:
        'bun run --filter=@pyreon/ssr-showcase build:subpath && bun run --filter=@pyreon/ssr-showcase preview:subpath -- --port 5198 --strictPort',
      port: 5198,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
