import { defineConfig } from '@playwright/test'

/**
 * Playwright e2e config — runs framework-primitive e2e tests against real
 * example apps in real Chromium.
 *
 * ## Project status (post-Phase-2)
 *
 *   playground    ✓ wired to CI — covers reactivity, mount, bench
 *                   (signal → DOM, computed, batching, conditional
 *                   rendering, list reconciliation, perf). Targets
 *                   `examples/playground` which exposes `window.__pyreon`
 *                   for direct primitive access from tests.
 *
 *   ssr-showcase  ✓ wired to CI — covers SSR + hydration + nav +
 *                   loaders + theme. Targets `examples/ssr-showcase`.
 *                   Was previously disabled (zero's dev-SSR auto-loaded
 *                   `_layout.tsx` AND fs-router emitted it as a parent
 *                   route → double mount). Fixed alongside this re-enable.
 *
 *   ui-showcase   ✓ wired to CI as a SEPARATE step (own playwright
 *                   config at `playwright.ui-regression.config.ts`).
 *                   Real-app regression gate for the rendering/styling
 *                   layer (rocketstyle, styler, unistyle, elements,
 *                   runtime-dom). Targets `examples/ui-showcase`. Specs
 *                   in `e2e/ui-showcase-regression.spec.ts` replicate
 *                   bug-shapes from PRs #197/#200/#336/#349 so future
 *                   regressions in the same shapes fail fast.
 *
 *                   Why a separate config: playwright's `webServer` array
 *                   starts ALL listed servers regardless of which
 *                   `--project` is selected. Lumping playground +
 *                   ssr-showcase + ui-showcase into one config produces
 *                   resource-contention flakes during boot. Two configs
 *                   = two sequential boots = stable.
 *
 *   fundamentals  ✓ wired to CI — boots `examples/fundamentals-playground`
 *                   on port 5176 and runs three spec files: playground.spec
 *                   (sidebar / nav / dashboard / no-error sweep across all
 *                   16 routes), dom-interactions.spec (browser-API surface),
 *                   storage.spec (localStorage / sessionStorage / cookies +
 *                   cross-tab storage events). 19 tests; ~7s wall-clock.
 *
 *                   Realigned in Phase C2 — the layout had moved to
 *                   RouterLink-based nav (renders `<a>`) and the legacy
 *                   tests still selected `nav.sidebar button`. `.first()`
 *                   selectors mirror the ssr-showcase double-mount
 *                   workaround.
 *
 *   visual        — REMOVED. The original spec wrote screenshots to a
 *                   gitignored folder for an external diff workflow, not
 *                   a real Playwright snapshot regression. It also assumed
 *                   a tab-based UI (Components / Hooks / Dark / Open
 *                   modal buttons) that no longer exists in `ui-showcase`
 *                   (route-based, 60 routes today). Re-enabling needs a
 *                   complete rewrite using `toHaveScreenshot()` plus a
 *                   matched-Docker baseline-capture pipeline (capturing
 *                   on macOS and asserting on Linux CI without fuzz
 *                   thresholds is structurally flaky). Tracked as a
 *                   separate scoped follow-up; not blocking the C2 close.
 *
 * ## Adding a project
 *
 *   1. Create / use an example in `examples/<name>/`
 *   2. Add a project entry below with `testMatch` and a unique `baseURL`
 *      port (5173-5181 reserved for e2e)
 *   3. Add a webServer entry that starts that example on the same port
 *      with `--strictPort` (so a stale process fails fast instead of
 *      silently picking a different port — exactly the broken state
 *      this config was in before Phase 2 wired e2e to CI for the first
 *      time)
 *   4. Verify locally: `bunx playwright test --project=<name>`
 *
 * ## Why webServer commands use `--strictPort`
 *
 * Vite normally falls back to the next available port if the requested
 * one is taken. For e2e, that silently routes tests to the wrong server
 * (or a cached process from a prior run). Strict-port forces a fast
 * failure that's easier to diagnose.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    // ── ACTIVE PROJECTS ────────────────────────────────────────────────
    // Wired into CI via the `E2E` job in `.github/workflows/ci.yml`.
    // playground project — narrowed to the spec files that have current
    // selectors/assertions matching the playground example. `app.spec.ts`
    // and `bench-compare.spec.ts` are temporarily excluded (test/example
    // drift in app.spec.ts; bench-compare needs cross-framework apps
    // pre-built which CI doesn't do yet). Re-enable each by adding back
    // to this regex and verifying locally.
    {
      name: 'playground',
      testMatch: /e2e\/(reactivity|mount|bench|app|primitives)\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5173' },
    },

    {
      name: 'ssr-showcase',
      testMatch: /ssr-showcase\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5175' },
    },

    // ui-showcase project lives in `playwright.ui-regression.config.ts`
    // (own config + own webServer to avoid boot-time resource contention).

    {
      name: 'fundamentals',
      testMatch: /e2e\/fundamentals\/.*\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5176' },
    },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/playground dev -- --port 5173 --strictPort',
      port: 5173,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'bun run --filter=@pyreon/ssr-showcase dev -- --port 5175 --strictPort',
      port: 5175,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },

    {
      command:
        'bun run --filter=@pyreon/fundamentals-playground dev -- --port 5176 --strictPort',
      port: 5176,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },

    // ui-showcase webServer lives in `playwright.ui-regression.config.ts`.
  ],
})
