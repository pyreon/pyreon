import { defineConfig } from '@playwright/test'

/**
 * Playwright config — create-pyreon-app fixtures.
 *
 * Boots the seven pre-scaffolded fixture apps under `examples/`:
 *   - examples/cpa-pw-app          (template=app,       adapter=vercel)
 *   - examples/cpa-pw-blog         (template=blog,      adapter=static)
 *   - examples/cpa-pw-dash         (template=dashboard, adapter=vercel,
 *                                  integrations=supabase+email)
 *   - examples/cpa-pw-app-react    (app + --compat=react)
 *   - examples/cpa-pw-app-vue      (app + --compat=vue)
 *   - examples/cpa-pw-app-solid    (app + --compat=solid)
 *   - examples/cpa-pw-app-preact   (app + --compat=preact)
 *
 * Each spec exercises:
 *   1. Mount + render — the SSR landing returns expected content
 *   2. Reactive state — clicks update DOM via signals (the framework
 *      contract Pyreon's whole story rests on)
 *   3. Routing / hydration — navigation works without console errors
 *   4. Template-specific surface (RSS feed, login, PDF export, etc.)
 *
 * The 4 compat-mode fixtures share `e2e/cpa-app-compat.shared.ts` — they
 * all scaffold from the same `app` template, only `pyreon({ compat: <x> })`
 * and the matching `@pyreon/<x>-compat` dep change. The runtime gate
 * proves all 4 actually mount + react in a real browser, complementing
 * the build-time `cpa-smoke-app-*-compat` cells in `scripts/scaffold-smoke.ts`.
 *
 * Fixtures are pre-scaffolded and committed (not regenerated per run),
 * because regenerating mid-test would defeat the gate's purpose. The
 * `Scaffold Smoke` CI job already proves the scaffolder works end-to-end;
 * this gate proves the OUTPUT works end-to-end at runtime. A separate
 * `cpa-fixture-drift.ts` script asserts the committed fixtures match what
 * the scaffolder would generate today.
 *
 * Separate config from the main `playwright.config.ts` because Playwright
 * boots ALL listed webServers regardless of `--project` filter; lumping
 * 7 more dev servers into the main config would put significant resource
 * pressure on every CI run.
 *
 * CI:
 *   `.github/workflows/ci.yml`'s `E2E` job runs `bun run test:e2e:cpa`
 *   (this config) as a separate step alongside the existing
 *   `test:e2e` / `test:e2e:ui-regression` / `test:e2e:compat` steps.
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
      name: 'cpa-app',
      testMatch: /\/cpa-app\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5191' },
    },
    {
      name: 'cpa-blog',
      testMatch: /\/cpa-blog\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5192' },
    },
    {
      name: 'cpa-dash',
      testMatch: /\/cpa-dash\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5193' },
    },
    {
      name: 'cpa-app-react-compat',
      testMatch: /\/cpa-app-react-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5194' },
    },
    {
      name: 'cpa-app-vue-compat',
      testMatch: /\/cpa-app-vue-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5195' },
    },
    {
      name: 'cpa-app-solid-compat',
      testMatch: /\/cpa-app-solid-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5196' },
    },
    {
      name: 'cpa-app-preact-compat',
      testMatch: /\/cpa-app-preact-compat\.spec\.ts$/,
      use: { baseURL: 'http://localhost:5197' },
    },
  ],
  webServer: [
    {
      command: 'bun run --filter=cpa-pw-app dev -- --port 5191',
      port: 5191,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=cpa-pw-blog dev -- --port 5192',
      port: 5192,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=cpa-pw-dash dev -- --port 5193',
      port: 5193,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=cpa-pw-app-react dev -- --port 5194',
      port: 5194,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=cpa-pw-app-vue dev -- --port 5195',
      port: 5195,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=cpa-pw-app-solid dev -- --port 5196',
      port: 5196,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run --filter=cpa-pw-app-preact dev -- --port 5197',
      port: 5197,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
