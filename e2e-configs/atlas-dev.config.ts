import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * `atlas dev` e2e — boots the REAL CLI command against the workshop example,
 * so what is exercised is what a user runs rather than an in-process helper.
 *
 * `cwd: '..'` because webServer commands run from the config file's directory;
 * this makes the bin path repo-root-relative, matching the other configs here.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'atlas-dev', testMatch: /atlas-dev\.spec\.ts$/, port: 5215 }],
  webServer: [
    {
      command: 'bun packages/tools/atlas/bin/atlas.js dev examples/atlas-workshop --port=5215',
      cwd: '..',
      port: 5215,
      timeout: 120_000,
    },
  ],
})
