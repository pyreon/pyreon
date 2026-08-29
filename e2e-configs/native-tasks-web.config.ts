import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * The WEB third of the tri-target proof for
 * `examples/native-tasks/src/TasksApp.tsx`.
 *
 * That source is compiled by PMTC for iOS and Android and BUNDLED by this web
 * sibling, and the device gates cover the first two. The web half had only the
 * `check-shared-source-deps` gate, which proves every import RESOLVES — not
 * that the screen renders. A package can lower and build on all three targets
 * and still render nothing on the one that runs in a browser.
 *
 * CI: `bun run test:e2e:native-tasks-web` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    {
      name: 'native-tasks-web',
      testMatch: /\/native-tasks-web\.spec\.ts$/,
      port: 5204,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-native-tasks-web', 5204)],
})
