import { defineConfig } from '@playwright/test'

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
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // CI: retry flaky specs (overlayfs / timing / HMR-ws / resource-
  // contention races) so a single flake self-heals within its job; a
  // real bug fails all attempts. Local stays 0 for honest, fast feedback.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'zero-hmr',
      testMatch: /zero-hmr\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5201' },
    },
  ],
  webServer: [
    {
      // The zero-hmr gate edits a route file mid-test via a programmatic
      // in-place writeFileSync and asserts the DOM hot-updates in place.
      // It was a CI-ONLY failure no local run reproduced. The OS file
      // WATCHER — not the framework HMR pipeline — was the cause, and NO
      // watcher configuration works on the GHA Linux runner:
      //
      //  • GHA Linux dev FS is overlayfs, where inotify does NOT reliably
      //    deliver `change` events for a programmatic write.
      //  • Bun's watcher layer is independently unreliable for it.
      //  • Vite 8 `server.watch.usePolling` is blind in this setup under
      //    BOTH Bun and Node (proven locally — never delivers either).
      //  • macOS fsevents happens to deliver it → the only reason any
      //    local run passed; CI is the sole repro environment.
      //
      // FIX (see examples/ssr-showcase/vite.config.ts:hmrTestTrigger):
      // remove the OS-watcher dependency. The dev-only test plugin
      // exposes /__pyreon_hmr_touch__; the spec POSTs to it after writing
      // the file, and it calls `server.watcher.emit('change', f)` — the
      // exact entrypoint a real fs event uses — driving Vite's full,
      // genuine HMR pipeline deterministically. OS / runtime / fs no
      // longer matter for the trigger.
      //
      // Still run vite via NODE (not `bun run … dev`): Node is the
      // proven-good runtime locally and avoids any Bun-specific chokidar
      // `.emit` quirk — belt-and-braces now that the trigger is
      // watcher-independent. `node_modules/.bin/vite` is hoisted to the
      // workspace root by Bun's installer (verified in CI's post-`bun
      // install` layout); the example's vite.config.ts + workspace
      // `bun`-condition resolution work identically under Node (SSR
      // pipeline + zero plugin chain exercised end-to-end in the
      // confirming experiment). `cwd` points Vite at the example.
      command: 'node ../../node_modules/.bin/vite --port 5201 --strictPort',
      cwd: 'examples/ssr-showcase',
      port: 5201,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      // Scoped to THIS gate's dev server only — the example's
      // vite.config.ts reads it to mount the dev-only
      // `pyreon:hmr-test-trigger` plugin (the spec POSTs to its
      // /__pyreon_hmr_touch__ endpoint to drive Vite's real HMR pipeline
      // deterministically, bypassing the flaky OS watcher entirely).
      env: { PYREON_HMR_TEST: '1' },
    },
  ],
})
