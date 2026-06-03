import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate locking the runtime contract for the Phase D
 * canonical-primitives TodoMVC web example (PR #947). verify-modes
 * asserts the BUILD shape; this gate asserts the RUNTIME: mount → Field
 * onChangeText + onSubmit, Checkbox toggle, Button onPress filters,
 * clear-completed.
 *
 * CI: `bun run test:e2e:native-todomvc-web` (own step).
 */
const _baseConfig = definePlaywrightConfig({
  projects: [
    {
      name: 'native-todomvc-web',
      testMatch: /\/native-todomvc-web\.spec\.ts$/,
      port: 5202,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-native-todomvc-web', 5202)],
})

// testDir resolves relative to this config file's directory; the
// repo's e2e/ specs sit one level up.
_baseConfig.testDir = '../e2e'

export default _baseConfig
