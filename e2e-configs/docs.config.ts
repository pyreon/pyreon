import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * docs real-Chromium gate — production docs site (@pyreon/docs).
 *
 * Exercises the docs rendering against the running dev server:
 *   - landing page renders the PyreonLanding component
 *   - sidebar nav from /docs/getting-started to /docs/router works
 *   - Toc scroll-spy on a long page (reactivity.md)
 *   - 404 page renders for an unknown URL
 *   - APICard / PropTable rendering on router.md
 *
 * Booted on port 5191 (matches docs/vite.config.ts).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [
    { name: 'docs', testMatch: /docs\.spec\.ts$/, port: 5191 },
  ],
  webServer: [
    {
      command:
        'bun run --filter=@pyreon/docs dev -- --port 5191 --strictPort',
      port: 5191,
      cwd: '..',
      timeout: 120_000,
    },
  ],
})
