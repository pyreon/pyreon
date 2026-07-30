import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * `loom dev` e2e — the REAL CLI serving the observatory over the REAL
 * monorepo (`cwd: '..'` makes the bin path repo-root-relative, matching the
 * atlas-dev config). The scanned workspace is this repo itself — the richest
 * fixture available and the dogfood the package exists for.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'loom-dev', testMatch: /loom-dev\.spec\.ts$/, port: 5232 }],
  webServer: [
    {
      command: 'node packages/tools/loom/bin/loom.js dev . --port=5232',
      cwd: '..',
      port: 5232,
      timeout: 120_000,
    },
  ],
})
