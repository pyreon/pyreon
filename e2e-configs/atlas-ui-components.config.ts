import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * The DEPLOYED workbench — `atlas build` over `@pyreon/ui-components`, the
 * exact command `docs.yml` runs for pyreon.dev/atlas, served as a plain
 * static host would serve it.
 *
 * The workshop gates prove the tool; this proves the product. The 2026-09
 * audit found the deployed site rendering 24 of 108 components as an empty
 * or zero-area preview while every other gate stayed green — the workshop's
 * seven components never exercised an overlay, a render-prop base, a `<table>`
 * or a part that needs its parent. Only the real library does.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'atlas-ui-components', testMatch: /atlas-ui-components\.spec\.ts$/, port: 5217 }],
  webServer: [
    {
      command:
        'bun packages/tools/atlas/bin/atlas.js build packages/ui/components --out atlas-dist-e2e --title "Pyreon UI" && ' +
        'bun scripts/serve-ssg.ts packages/ui/components/atlas-dist-e2e 5217',
      cwd: '..',
      port: 5217,
      // A real Vite production build over 108 components plus a lens pass per
      // component; 120s is not enough on a cold CI runner.
      timeout: 300_000,
    },
  ],
})
