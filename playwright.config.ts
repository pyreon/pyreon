import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

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
// Shared defaults (testDir, retries, use, reuseExistingServer, webServer
// timeout) live in `@pyreon/playwright-config`; this config states only the
// projects + their dev servers. ui-showcase has its own
// `playwright.ui-regression.config.ts` (own webServer) to avoid boot-time
// resource contention — Playwright's `webServer` array boots ALL listed
// servers regardless of `--project`.
export default definePlaywrightConfig({
  projects: [
    // playground — narrowed to the spec files with current selectors.
    // `app`/`bench-compare` drift is tracked separately.
    {
      name: 'playground',
      testMatch: /e2e\/(reactivity|mount|bench|app|primitives)\.spec\.ts$/,
      port: 5173,
    },
    { name: 'ssr-showcase', testMatch: /ssr-showcase\.spec\.ts$/, port: 5175 },
    { name: 'fundamentals', testMatch: /e2e\/fundamentals\/.*\.spec\.ts$/, port: 5176 },
    // Dev throw-time fix printer (6.1b/6.1c) — runs against fundamentals-
    // playground on 5176 BECAUSE that app does NOT declare `@pyreon/compiler`,
    // so it exercises the plugin-side resolution of `@pyreon/compiler/diagnose`
    // (an app WITH the dep would resolve it natively and hide that bug). Catches
    // both the inline-vs-src CORS regression AND the cross-app resolution one.
    { name: 'dev-error-printer', testMatch: /dev-error-printer\.spec\.ts$/, port: 5176 },
  ],
  webServer: [
    viteDevServer('@pyreon/example-playground', 5173),
    viteDevServer('@pyreon/example-ssr-showcase', 5175),
    viteDevServer('@pyreon/example-fundamentals-playground', 5176),
  ],
})
