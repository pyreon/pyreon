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
 *   fundamentals  ⚠ DISABLED — `nav.sidebar` selector mismatch with
 *                   current `examples/fundamentals-playground` markup.
 *                   Tests need to be re-aligned with the example or vice
 *                   versa. Follow-up.
 *
 *   visual        ⚠ DISABLED — visual-regression baselines not
 *                   committed. Needs baseline-capture pass before
 *                   wiring.
 *
 * ## Adding a project
 *
 *   1. Create / use an example in `examples/<name>/`
 *   2. Add a project entry below with `testMatch` and a unique `baseURL`
 *      port (5173-5180 reserved for e2e)
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
      testMatch: /e2e\/(reactivity|mount|bench|app)\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5173' },
    },

    {
      name: 'ssr-showcase',
      testMatch: /ssr-showcase\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5175' },
    },

    // ui-showcase project lives in `playwright.ui-regression.config.ts`
    // (own config + own webServer to avoid boot-time resource contention).

    // ── DISABLED PROJECTS — gated until follow-ups land ───────────────
    // Re-enable by uncommenting AND updating the disabled list in
    // .github/workflows/ci.yml's E2E job.
    /* {
      name: 'fundamentals',
      testMatch: /e2e\/fundamentals\/.*\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5176' },
    }, */
    /* {
      name: 'visual',
      testMatch: /visual-regression\.spec\.ts$/,
      use: {
        baseURL: 'http://localhost:5174',
        viewport: { width: 1280, height: 720 },
      },
    }, */
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

    // ui-showcase webServer lives in `playwright.ui-regression.config.ts`.

    // Disabled servers — uncomment when re-enabling the matching project above.
    /* {
      command:
        'bun run --filter=@pyreon/fundamentals-playground dev -- --port 5176 --strictPort',
      port: 5176,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    }, */
  ],
})
