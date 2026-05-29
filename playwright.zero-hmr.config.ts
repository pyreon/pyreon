import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Playwright config — Zero component-HMR real-Chromium gate.
 *
 * Boots `examples/ssr-showcase` in DEV mode (real zero dev SSR + Vite
 * HMR — the exact pipeline a user runs `vite` against) on a dedicated
 * port and drives `e2e/zero-hmr.spec.ts`, which edits a route component
 * file mid-test and asserts the DOM updates IN PLACE without a manual
 * (or automatic) page reload while the module-scope signal keeps its
 * value.
 *
 * This is the runtime gate for the fix to the bare-`import.meta.hot
 * .accept()` bug: `@pyreon/vite-plugin` now emits a coordinator-driven
 * accept that calls `@pyreon/router`'s `_hmrReload` to re-resolve the
 * active route's lazy component in place. Unit tests (router 518 specs,
 * vite-plugin 83 specs) prove the wiring; only a real dev server +
 * real Chromium + a real file edit proves the end-to-end contract.
 *
 * Separate config (not folded into playwright.config.ts) because
 * Playwright's `webServer` array boots ALL listed servers regardless of
 * `--project` selection — same boot-isolation rationale as
 * ssg-subpath / ssg-i18n / ui-regression / compat-layers / app-showcase.
 *
 * `workers: 1` — the spec mutates a committed source file and restores
 * it; concurrent specs editing the same file would race.
 *
 * CI: `.github/workflows/ci.yml`'s `E2E` job runs this as a separate
 * step (`bun run test:e2e:zero-hmr`).
 */
export default definePlaywrightConfig({
  timeout: 60_000,
  // The spec mutates a committed source file (and restores it) — must not
  // run in parallel with anything sharing that file.
  workers: 1,
  projects: [{ name: 'zero-hmr', testMatch: /zero-hmr\.spec\.ts$/, port: 5201 }],
  webServer: [
    {
      // Run vite via NODE (not `bun run … dev`): the only proven-reliable
      // runtime for the HMR trigger on the GHA Linux runner (overlayfs +
      // Bun watcher quirks make `bun … dev` flaky). `node_modules/.bin/vite`
      // is hoisted to the workspace root by Bun's installer; `cwd` points
      // it at the example. See examples/ssr-showcase/vite.config.ts:
      // hmrTestTrigger — the dev-only plugin (gated on PYREON_HMR_TEST)
      // exposes /__pyreon_hmr_touch__ so the spec drives Vite's real HMR
      // pipeline deterministically, bypassing the flaky OS watcher.
      command: 'node ../../node_modules/.bin/vite --port 5201 --strictPort',
      cwd: 'examples/ssr-showcase',
      port: 5201,
      timeout: 180_000,
      env: { PYREON_HMR_TEST: '1' },
    },
  ],
})
