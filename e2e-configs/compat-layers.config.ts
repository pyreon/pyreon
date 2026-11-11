import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate for the 5 compat layers
 * (`@pyreon/{react,preact,vue,solid,svelte}-compat`).
 *
 * Each spec exercises 3 surfaces against its compat-mode example app:
 *   1. Mount + render — example boots, expected header / counter shows.
 *   2. Reactive state — counter button click updates DOM (state →
 *      re-render in real Chromium). Catches the "smoke browser test
 *      passes but the real-framework re-render path breaks" gap.
 *   3. Lifecycle — re-mount / sub-route nav without console errors.
 *
 * Every spec runs twice: once against `src/` (the example's own dev server,
 * which resolves `@pyreon/*` through the `bun` condition) and once as a
 * `*-lib` project against the packages' built `lib/` (the same dev server
 * with `bun` removed by `shipped-lib.vite.config.ts`), which is what a
 * consumer of the published packages runs. Both are `vite` DEV servers, so a
 * layer that only works in a production build fails here (#4283).
 *
 * CI: `bun run test:e2e:compat` (own step). The `*-lib` projects need the
 * packages' `lib/` to be current (`bun install` builds it).
 */
const LAYERS = [
  { name: 'react', port: 5177, libPort: 5240 },
  { name: 'preact', port: 5178, libPort: 5241 },
  { name: 'vue', port: 5179, libPort: 5242 },
  { name: 'solid', port: 5180, libPort: 5243 },
  { name: 'svelte', port: 5182, libPort: 5244 },
] as const

export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: LAYERS.flatMap(({ name, port, libPort }) => {
    const testMatch = new RegExp(`/${name}-compat\\.spec\\.ts$`)
    return [
      { name: `${name}-compat`, testMatch, port },
      { name: `${name}-compat-lib`, testMatch, port: libPort },
    ]
  }),
  webServer: LAYERS.flatMap(({ name, port, libPort }) => [
    viteDevServer(`@pyreon/example-${name}-compat`, port),
    {
      // `cwd` is relative to this config's directory. Node runs the
      // workspace-root `vite` binary, as `zero-hmr.config.ts` does.
      command: `node ../../node_modules/.bin/vite --config ../../e2e-configs/shipped-lib.vite.config.ts --port ${libPort} --strictPort`,
      cwd: `../examples/${name}-compat`,
      port: libPort,
    },
  ]),
})
