import { defineConfig } from '@playwright/test'

/**
 * Playwright config — compat layers (`@pyreon/{react,preact,vue,solid}-compat`).
 *
 * Separate from the main `playwright.config.ts` because Playwright's
 * `webServer` array boots ALL listed servers regardless of which
 * `--project` is selected. With 4 compat-layer apps each spawning a
 * Vite dev server, lumping them into the main config would put 4
 * additional dev servers on every CI run — significant resource pressure.
 *
 * Sequential boot via a separate config = stable runs.
 *
 * Specs (one per compat layer):
 *   `e2e/react-compat.spec.ts`
 *   `e2e/preact-compat.spec.ts`
 *   `e2e/vue-compat.spec.ts`
 *   `e2e/solid-compat.spec.ts`
 *
 * Each spec exercises the same 3 surfaces:
 *   1. Mount + render — the example app boots and shows the expected
 *      header / counter element. Catches "compat layer regressed and
 *      breaks the example app at boot" regressions.
 *   2. Reactive state — clicking a counter button updates DOM (state →
 *      re-render in real Chromium). Catches the "smoke browser test
 *      passes but the real-framework re-render path breaks" gap.
 *   3. Lifecycle — re-mount or sub-route navigation works without
 *      console errors. Catches cleanup leaks.
 *
 * The whole point of compat is "behaves like the real framework in a
 * real app". Vitest-browser proves the surface; this gate proves the
 * shape.
 *
 * CI:
 *   `.github/workflows/ci.yml`'s `E2E` job runs `bun run test:e2e:compat`
 *   (this config) as a separate step alongside the existing
 *   `test:e2e` and `test:e2e:ui-regression` steps.
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
    {
      // testMatch anchored on the directory separator because
      // `react-compat.spec.ts` is a suffix of `preact-compat.spec.ts` —
      // a bare `react-compat\.spec\.ts$` regex would pick up both.
      name: 'react-compat',
      testMatch: /\/react-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5177' },
    },
    {
      name: 'preact-compat',
      testMatch: /\/preact-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5178' },
    },
    {
      name: 'vue-compat',
      testMatch: /\/vue-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5179' },
    },
    {
      name: 'solid-compat',
      testMatch: /\/solid-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5180' },
    },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/example-react-compat dev -- --port 5177 --strictPort',
      port: 5177,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'bun run --filter=@pyreon/example-preact-compat dev -- --port 5178 --strictPort',
      port: 5178,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'bun run --filter=@pyreon/example-vue-compat dev -- --port 5179 --strictPort',
      port: 5179,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'bun run --filter=@pyreon/example-solid-compat dev -- --port 5180 --strictPort',
      port: 5180,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
