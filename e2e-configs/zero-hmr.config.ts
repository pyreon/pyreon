import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Zero component-HMR real-Chromium gate. Boots `examples/ssr-showcase`
 * in dev (real zero dev SSR + Vite HMR — the exact pipeline a user
 * runs `vite` against) and drives `e2e/zero-hmr.spec.ts`, which edits
 * a route component file mid-test and asserts the DOM updates IN PLACE
 * without a reload while the module-scope signal keeps its value.
 *
 * Runs vite via NODE (not `bun run … dev`): the only proven-reliable
 * runtime for the HMR trigger on the GHA Linux runner (overlayfs + Bun
 * watcher quirks make `bun … dev` flaky). `node_modules/.bin/vite` is
 * hoisted to the workspace root by Bun's installer; `cwd` points it at
 * the example. See `examples/ssr-showcase/vite.config.ts:hmrTestTrigger`
 * — the dev-only plugin (gated on `PYREON_HMR_TEST`) exposes
 * `/__pyreon_hmr_touch__` so the spec drives Vite's real HMR pipeline
 * deterministically, bypassing the flaky OS watcher.
 *
 * `workers: 1` — the spec mutates a committed source file and restores
 * it; concurrent specs editing the same file would race.
 *
 * CI: `bun run test:e2e:zero-hmr` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  workers: 1,
  projects: [
    { name: 'zero-hmr', testMatch: /zero-hmr\.spec\.ts$/, port: 5201 },
  ],
  webServer: [
    {
      command: 'node ../../node_modules/.bin/vite --port 5201 --strictPort',
      cwd: 'examples/ssr-showcase',
      port: 5201,
      timeout: 180_000,
      env: { PYREON_HMR_TEST: '1' },
    },
  ],
})
