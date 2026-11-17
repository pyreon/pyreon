import { join } from 'node:path'
import { definePlaywrightConfig } from '@pyreon/playwright-config'
import { exampleDir, REPO_ROOT } from '../scripts/example-dirs'

/**
 * Zero component-HMR real-Chromium gate. Boots `examples/fixtures/ssr-showcase`
 * in dev (real zero dev SSR + Vite HMR — the exact pipeline a user
 * runs `vite` against) and drives `e2e/zero-hmr.spec.ts`, which edits
 * a route component file mid-test and asserts the DOM updates IN PLACE
 * without a reload while the module-scope signal keeps its value.
 *
 * Runs vite via NODE (not `bun run … dev`): the only proven-reliable
 * runtime for the HMR trigger on the GHA Linux runner (overlayfs + Bun
 * watcher quirks make `bun … dev` flaky). `node_modules/.bin/vite` is
 * hoisted to the workspace root by Bun's installer; `cwd` points it at
 * the example. See `examples/fixtures/ssr-showcase/vite.config.ts:hmrTestTrigger`
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
      // Absolute paths: the workspace-root vite binary, run inside the
      // example (examples/fixtures/ssr-showcase; exampleDir() fails loudly
      // if it ever moves).
      command: `node ${join(REPO_ROOT, 'node_modules/.bin/vite')} --port 5201 --strictPort`,
      cwd: exampleDir('fixtures/ssr-showcase'),
      port: 5201,
      timeout: 180_000,
      env: { PYREON_HMR_TEST: '1' },
    },
  ],
})
