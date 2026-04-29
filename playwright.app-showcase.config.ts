import { defineConfig } from '@playwright/test'

/**
 * Playwright config — app-showcase (`@pyreon/example-app-showcase`).
 *
 * Separate from the main `playwright.config.ts` because Playwright's
 * `webServer` array boots ALL listed servers regardless of which
 * `--project` is selected. Adding app-showcase to the main config would
 * boot another Vite dev server on every CI run that exercises only
 * playground / fundamentals / ssr-showcase — significant resource
 * pressure that's already manifested as flakes in earlier wired-in
 * configs (`playwright.ui-regression.config.ts`,
 * `playwright.compat-layers.config.ts`).
 *
 * Sequential boot via a separate config = stable runs.
 *
 * Specs:
 *   `e2e/app-showcase-flow.spec.ts` — `@pyreon/flow` real-app coverage:
 *     render shape, selection-class application on click, node drag via
 *     real pointer events (mouse.down/move/up with multi-step move so
 *     pointer-event listeners actually fire), wheel pan over the canvas
 *     viewport. Companion `e2e/app-showcase-dnd.spec.ts` is queued
 *     once a `@pyreon/dnd` consumer demo lands in app-showcase (Task 4
 *     in `.claude/plans/jaunty-herding-kazoo.md`).
 *
 * The whole point of e2e here is "the cross-package behavior of pointer
 * events + reactive transforms + lazy-loaded elkjs in a real-app shape" —
 * vitest-browser tests prove the unit surface, this gate proves the
 * shape under real Chromium.
 *
 * CI:
 *   `.github/workflows/ci.yml`'s `E2E` job runs `bun run test:e2e:app-showcase`
 *   (this config) as a separate step alongside `test:e2e`,
 *   `test:e2e:ui-regression`, and `test:e2e:compat`.
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
      name: 'app-showcase',
      testMatch: /\/app-showcase-(flow|dnd)\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5181' },
    },
  ],
  webServer: [
    {
      command: 'bun run --filter=@pyreon/example-app-showcase dev -- --port 5181 --strictPort',
      port: 5181,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
